# @denvig/sdk

The in-process logic layer behind the [denvig](https://github.com/marcqualie/denvig) CLI.

`@denvig/sdk` runs denvig's logic directly rather than shelling out to the CLI
binary, so integrations can take actions and read data programmatically.

```ts
import { DenvigSDK } from '@denvig/sdk'

const denvig = new DenvigSDK({ client: 'my-app' })

const services = await denvig.services.list()
await denvig.services.start('api')
const outdated = await denvig.deps.outdated()
const projects = await denvig.projects.list()
```

Most consumers should depend on the `denvig` package and import from
`denvig/sdk`, which re-exports this package.
