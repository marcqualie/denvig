# Denvig Troubleshooting

This guide is designed to help if things don't quite work as expected.


## Finding Denvig resources on disk

In order to uniquely identify resources on disk we need to normalise the paths to a project and the resources within them. An ID is constructed for each resource based on the following format:

```
@{{project-slug}}|{{workspace}}|{{resource-type}}/{{resource-name}}
```

The ID is then converted to a sha256 hash to ensure a valid filesystem path string that is predictable and unique. This
hash is used for various internals such as log paths, service names and more.

Examples of resource IDs:

- Project: `@marcqualie/denvig#root`
- Action: `@marcqualie/denvig#root|action/hello`
- Workspace + Action: `@marcqualie/denvig#apps/web|action/dev`

You can find the hash details for a resource with the following command:

```bash
denvig tools:resource-hash service/hello # Example output: abc123...

# You can also use workspace notation:
denvig tools:resource-hash "apps/web|action/dev"

# Or use the --workspace flag:
denvig tools:resource-hash action/dev --workspace apps/web

# a full ID can also be passed in:
denvig tools:resource-hash "@marcqualie/denvig#apps/web|action/dev
```

You can also find the ID to verify it has been resolved correctly:

```bash
denvig tools:resource-id service/hello # @marcqualie/denvig#root|service/hello
```



## Directly manage launchctl services

Denvig uses launchctl under the hood to manage services so everything can also be interacted with directly there.

Directly list all denvig launchctl services that are currently loaded by running:

```bash
launchctl list | grep denvig
```

You can forcefully stop and remove all denvig services at once by running:

```bash
launchctl list | grep denvig | awk '{print $3}' | xargs -I {} -n 1 launchctl bootout gui/$(id -u)/{}
rm ~/.denvig/LaunchAgents/com.denvig.*
```

You can target a specific service by using it resource hash (detailed above):

```bash
launchctl bootout gui/$(id -u)/com.denvig.<resource-hash>
rm ~/.denvig/LaunchAgents/com.denvig.<resource-hash>.plist
```



## Browsing Raw Logs

All logs are store in `~/.denvig/logs/`. You can tail the logs of a specific service by running:

```bash
tail -f ~/.denvig/logs/<resource-hash>.log
```
