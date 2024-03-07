# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

- ANTL4 Grammar file for MTScript

## [0.1.0]

### Added

- Binary expression tokenization
- Support for RPEdit formats
  - Macro Name scoped to `entity.name.class.mts`
  - `@PROPS@` tokenized
    - Valid prop keys  scoped to `support.variable.mts`
  - Folding for RPEdit format which closes with `!!`

### Changed

- Built-in function names' scope changed from `entity.name.function.built-in.mts`
to `support.function.mts`

### Fixed

- Some typos in operator Regexes
- Some edge-cases when ',' or ']' appear in strings.

## [0.0.1]

### Added

- MapTool script language support
- TextMate grammar file for MapTool script Syntax Highlighting
- Script to convert YAML w/variables to JSON.
- `configuration` contribution to set built-in functions to render **bold**
- Readme w/Sample Images
- LICENSE
- Extension Logo Icon
