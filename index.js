import path from 'path';
import url from 'url';
import fs from 'fs';
import {
	Source,
	parse,
	validate,
	getOperationAST,
	specifiedRules
} from 'graphql';

const directoryName = path.dirname(url.fileURLToPath(import.meta.url));

export default function graphqlMiddleware({ schema, execute }) {
	return (request, response, next) => {
		let query;
		let variables;
		let operationName;
		let raw;
		let showGraphiQL = false;

		function respond(result) {
			if (showGraphiQL) {
				respondWithGraphiQL(
					response,
					{
						query, variables, operationName, raw
					},
					result
				);

				return;
			}

			response.json(result);
		}

		function respondWithError(e) {
			respond({ errors: [{ message: e }] });
		}

		const urlData = new URLSearchParams(request.url.split('?')[1]);
		let body = {};

		if ((typeof request.body === 'string' || request.body instanceof Buffer)) {
			body = { query: request.body.toString() };
		}

		if (typeof request.body === 'object' && request.body != null) {
			body = request.body;
		}

		query = urlData.get('query') ?? body.query;
		if (typeof query !== 'string') {
			query = undefined;
		}

		variables = urlData.get('variables') ?? body.variables;
		if (typeof variables === 'string') {
			try {
				variables = JSON.parse(variables);
			} catch (e) {
				response.statusCode = 400;
				respondWithError('Variables are invalid JSON.');

				return;
			}
		} else if (typeof variables !== 'object' || variables == null) {
			variables = undefined;
		}

		operationName = urlData.get('operationName') ?? body.operationName;
		if (typeof operationName !== 'string') {
			operationName = undefined;
		}

		raw = urlData.get('raw') != null || body.raw !== undefined;

		if (request.method !== 'GET' && request.method !== 'POST') {
			response.statusCode = 405;
			response.setHeader('allow', 'GET, POST');
			respondWithError('GraphQL only supports GET and POST requests.');

			return;
		}

		showGraphiQL = !raw && request.accepts(['json', 'html']) === 'html';

		if (query == null) {
			if (showGraphiQL) {
				respondWithGraphiQL(response);

				return;
			}

			response.statusCode = 400;
			respondWithError('Must provide query string.');

			return;
		}

		let documentAST;
		try {
			documentAST = parse(new Source(query, 'GraphQL request'));
		} catch (e) {
			response.status = 400;
			respond({ errors: [e] });

			return;
		}

		const validationErrors = validate(schema, documentAST, specifiedRules);

		if (validationErrors.length > 0) {
			response.status = 400;
			respond({ errors: validationErrors });

			return;
		}

		if (request.method === 'GET') {
			const operationAST = getOperationAST(documentAST, operationName);
			if (operationAST && operationAST.operation !== 'query') {
				if (showGraphiQL) {
					respondWithGraphiQL(response, {
						query, variables, operationName, raw
					});

					return;
				}

				response.statusCode = 405;
				response.setHeader('allow', 'POST');
				respondWithError(`Can only perform a ${operationAST.operation} operation from a POST request.`);

				return;
			}
		}

		execute({
			schema,
			document: documentAST,
			variableValues: variables,
			operationName,
			contextValue: request
		})
			.then(respond, next);
	};
}

const wsClientLibrary = fs.readFileSync(path.resolve(path.dirname(url.fileURLToPath(import.meta.resolve('graphql-ws'))), '..', 'umd', 'graphql-ws.js'), 'utf8').trim();
// eslint-disable-next-line max-len
// const wsClientLibrary = fs.readFileSync(path.join(directoryName, 'node_modules', 'subscriptions-transport-ws', 'browser', 'client.js'), 'utf8').trim();
const graphiqlScript = fs.readFileSync(path.join(directoryName, 'graphiql.js'), 'utf8').trim();

function respondWithGraphiQL(res, params, result) {
	const config = {
		query: params?.query,
		response: result,
		variables: params?.variables
	};

	res.setHeader('content-type', 'text/html; charset=utf-8');
	res.setHeader('content-security-policy', 'default-src \'none\'; style-src \'unsafe-inline\' cdnjs.cloudflare.com; script-src \'unsafe-inline\' \'unsafe-eval\' cdnjs.cloudflare.com; connect-src \'self\'; font-src data:');

	res.send(`<!--
The request to this GraphQL server provided the header "Accept: text/html"
and as a result has been presented GraphiQL - an in-browser IDE for
exploring GraphQL.
If you wish to receive JSON, provide the header "Accept: application/json" or
add "&raw" to the end of the URL within a browser.
-->
<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8" />
	<title>GraphiQL</title>
	<meta name="robots" content="noindex" />
	<meta name="referrer" content="origin" />
	<meta name="viewport" content="width=device-width, initial-scale=1" />
	<style>
		body {
			margin: 0;
			overflow: hidden;
		}
		#graphiql {
			height: 100vh;
		}
	</style>
	<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/graphiql/3.0.9/graphiql.min.css" integrity="K+t3+x6xDyTDFyAJb/Ea7+ECh55Xmy9+dpmyZLnSa2qWeo/NrRmOzzhR2LzuLFsNtnCzyqLfN5Xo7AtLLkFBLA==" crossorigin="anonymous" referrerpolicy="no-referrer" />
	<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js" integrity="sha512-8Q6Y9XnTbOE+JNvjBQwJ2H8S+UV4uA6hiRykhdtIyDYZ2TprdNmWOUaKdGzOhyr4dCyk287OejbPvwl7lrfqrQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js" integrity="sha512-MOCpqoRoisCTwJ8vQQiciZv0qcpROCidek3GTFS6KTk2+y7munJIlKCVkFCYY+p3ErYFXCjmFjnfTTRSC1OHWQ==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
	<script src="https://cdnjs.cloudflare.com/ajax/libs/graphiql/3.0.9/graphiql.min.js" integrity="NyL8lNETLNCyPdTsD5VhdWElsklCNNY3BvkJFpvPYLbLmCqPH/0S2YiYwDt7x+ipnPimDnhgwLNSrRDMzWmBSw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script>${wsClientLibrary}</script>
	</head>
<body>
	<div id="graphiql">Loading...</div>
	<script>
		const config = ${JSON.stringify(config)};
	</script>
	<script>
${graphiqlScript}
	</script>
</body>
</html>`);
}
