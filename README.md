# Denvig - Developer Environment Invigorator

[![npm version](https://img.shields.io/npm/v/denvig?color=yellow)](https://npmjs.com/package/denvig)
[![install size](https://packagephobia.com/badge?p=denvig)](https://packagephobia.com/result?p=denvig)

Denvig is a concept of simplifying development environments across multiple languages and frameworks by creating a small
set of consistent wrappers to avoid muscle memory and configuration headaches.



## Installation


### NPM

You can install the CLI tool globally using npm:

```shell
npm install -g denvig
```

After installation, the `denvig` command will be available in your terminal.



## Commands


### Actions

Executes an action inside the project. Defaults are detected for common languages/frameworks, but you can also
specify your own actions in the `.denvig.yml` file.

```shell
denvig run build
denvig run install
denvig run test
denvig run dev
```

Some actions are common to many frameworks so they have quick access for convenience:

```shell
denvig build
denvig test
denvig install
denvig lint
denvig outdated
```



## Languages / Frameworks

There is a set of core languages and frameworks that Denvig will support out of the box. Any language or framework
can be supported by using the per project configs.

- [x] Node.js (npm, pnpm, yarn)
- [ ] Bun
- [ ] Vite
- [x] Deno
- [ ] NextJS
- [ ] Ruby
- [ ] Rails
- [ ] Python



## Goals

- [x] CLI tool to simplify environment setup
- [x] YAML configuration at ~/.denvig.yml
- [x] Per project configuration via ./.denvig.yml
- [x] Consistent API for all languages/frameworks



## Building from source

You can build a fresh binary from source instead of using the provided methods above

```shell
deno task build
cp dist/denvig /usr/local/bin/denvig
```
