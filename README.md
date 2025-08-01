# Denvig - Developer Environment Invigorator.

Denvig is a concept of simplifying development environments across multiple languages and frameworks by creating a small
set of consistent wrappers to avoid muscle memory and configuration headaches.



## Goals

- [ ] CLI tool to simplify environment setup
- [ ] YAML configuration at ~/.denvig.yml
- [ ] Per project configuration via ./denvig.yml
- [ ] Consistent API for all languages/frameworks



## Installation

### Binary

Prebuilt binaries can be downloaded from the [releases page](https://github.com/marcqualie/denvig/releases).


### NPM

You can install the CLI tool globally using npm:

```shell
npm install -g denvig
```

After installation, the `denvig` command will be available in your terminal.



## Commands


### Run

Execites an action inside the project. Defaults are detected for common languages/frameworks, but you can also
specify your own actions in the `denvig.yml` file.

```shell
denvig run build
denvig run install
denvig run test
denvig run dev
```



## Languages / Frameworks

There is a set of core languages and frameworks that Denvig will support out of the box. Any language or framework
can be supported by using the per project configs.

- [ ] Deno
- [ ] Node.js / NextJS / Vite
- [ ] Ruby / Rails
- [ ] Python / Pip



## Building from source

You can build a fresh binary from source instead of using the provided methods above

```shell
deno task build
cp dist/denvig /usr/local/bin/denvig
```
