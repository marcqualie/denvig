# denvig

A CLI tool to consistently manage cross-discipline projects.

This package is a thin wrapper around [`@denvig/cli`](https://www.npmjs.com/package/@denvig/cli).
Installing `denvig` gives you the `denvig` binary, and the same API is available
programmatically:

```ts
// SDK (backwards compatible)
import { DenvigSDK } from 'denvig'

// Or via an explicit subpath
import { DenvigSDK } from 'denvig/sdk'
import { DenvigSDK } from 'denvig/cli'
```

See the [main README](https://github.com/marcqualie/denvig#readme) for full
documentation.
