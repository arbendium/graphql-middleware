/* eslint-env browser */
/* global React, ReactDOM, GraphiQL, config */

function makeAsyncIterableIteratorFromSink(client) {
	const queue = [];
	const requests = [];
	let done = false;
	let hasError = false;
	let finalValue;

	function complete() {
		if (!done) {
			dispose();
			done = true;
			requests.forEach(request => {
				request.resolve({ done: true });
			});
		}
	}

	function error(e) {
		if (!done) {
			dispose();
			done = true;
			hasError = true;
			finalValue = e;
			requests.forEach(request => {
				request.reject(e);
			});
		}
	}

	const dispose = client({
		next(value) {
			if (!done) {
				if (requests.length) {
					const request = requests.shift();
					request.resolve({ done: false, value });
				} else {
					queue.push(value);
				}
			}
		},
		complete,
		error
	});

	return {
		next() {
			if (hasError) {
				return Promise.reject(finalValue);
			}

			if (queue.length) {
				const value = queue.shift();

				return Promise.resolve({ done: false, value });
			}

			if (done) {
				return Promise.resolve({ done: true });
			}

			return new Promise((resolve, reject) => {
				requests.push({ resolve, reject });
			});
		},
		return: complete,
		throw: error,
		[Symbol.asyncIterator]() {
			return this;
		}
	};
}

const {
	query,
	response,
	variables
} = config;

const parameters = {};
window.location.search.slice(1).split('&').forEach(entry => {
	const eq = entry.indexOf('=');
	if (eq >= 0) {
		parameters[decodeURIComponent(entry.slice(0, eq))] = decodeURIComponent(entry.slice(eq + 1));
	}
});

const url = new URL('?', window.location.href).href.slice(0, -1);
const subscriptionUrl = url.replace(/^http/, 'ws');

const subscribe = window.graphqlWs
	? (sink, params, options) => {
		const client = window.graphqlWs.createClient({
			url: subscriptionUrl,
			connectionParams: {
				headers: options.headers
			}
		});

		client.subscribe(params, sink);

		return () => { client.terminate(); };
	}
	: (sink, params, options) => {
		const client = new window.SubscriptionsTransportWs.SubscriptionClient(subscriptionUrl, {
			connectionParams: {
				headers: options.headers
			}
		});

		client.request(params).subscribe(sink);

		return () => { client.close(); };
	};

async function fetcher(params, options) {
	let isSubscription = false;

	if (options?.documentAST) {
		window.GraphiQL.GraphQL.visit(options?.documentAST, {
			OperationDefinition(node) {
				if ((params.operationName ?? undefined) === node.name?.value) {
					if (node.operation === 'subscription') {
						isSubscription = true;
					}
				}
			}
		});
	}

	if (isSubscription) {
		return makeAsyncIterableIteratorFromSink(sink => subscribe(sink, params, options));
	}

	const response = await fetch(url, {
		method: 'POST',
		body: JSON.stringify(params),
		headers: {
			'content-type': 'application/json',
			...options?.headers ?? {}
		}
	});

	return response.json();
}

function updateURL() {
	const search = `?${Object.entries(parameters)
		.filter(([, value]) => Boolean(value))
		.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
		.join('&')}`;

	window.history.replaceState(null, null, search);
}

ReactDOM.render(
	React.createElement(GraphiQL, {
		fetcher,
		onEditQuery(newQuery) {
			parameters.query = newQuery;
			updateURL();
		},
		onEditVariables(newVariables) {
			parameters.variables = newVariables;
			updateURL();
		},
		onEditOperationName(newOperationName) {
			parameters.operationName = newOperationName;
			updateURL();
		},
		query,
		response: JSON.stringify(response, null, 2),
		variables: JSON.stringify(variables, null, '\t'),
		headerEditorEnabled: true,
		shouldPersistHeaders: true
	}),
	document.getElementById('graphiql')
);
