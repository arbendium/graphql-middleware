An Express middleware for GraphQL. Based on the original [express-graphql](https://www.npmjs.com/package/express-graphql) but heavily simplified and up-to-date. Together with GraphiQL with modern websocket support.

## API

```js
graphqlMiddleware({ schema, execute })
```

**Arguments**
 - `schema` - a GraphQL schema.
 - `execute` - a GraphQL execute function; this is mostly like an application-specific wrapper around GraphQL's own `execute` function.

For more information about these arguments and GraphQL overall, see [graphql-js](https://github.com/graphql/graphql-js) library.
