# Maptool VSCode Language Support

Visual Studio Code extension for MapTool macro script language support.
![Sample](images/sample-script.png)

## Features

Syntax highlighting and formatting for MapTool macro script (`.mts` and `.mtmacro`).

* Roll Options.
* *Most* nested macros.
* Special variables.
* Separate scopes for built-in vs user-defined functions.
  * By default built-in functions are bold, but that can be customized by theme.
* RPEdit formatting support.
* **Format Document** indents macro source by brace nesting.
* Optional formatting of HTML fragments inside string literals (see settings below).

![Multi-part example](images/multi-part-macro.png)

## Extension Settings

Open **Settings** and search for **MapTool Script**, or edit `settings.json`:

| Setting | Default | Description |
| --- | --- | --- |
| `maptoolScript.format.enable` | `true` | Enable **Format Document** for `.mts` / `.mtmacro`. |
| `maptoolScript.format.htmlInSingleQuotedStrings` | `true` | Format HTML inside single-quoted strings. |
| `maptoolScript.format.htmlInDoubleQuotedStrings` | `false` | Format HTML inside double-quoted strings. Off by default because beautified HTML may insert double quotes and break the macro string. |

## Known Issues

This is very basic. So depending on your coding style it may not catch everything.

## Release Notes

### 0.1.4

* `.mtmacro` files use the same MapTool Script language as `.mts`.
* **Format Document** for `.mts` / `.mtmacro` (brace-based indentation).
* Optional formatting of embedded HTML in strings, with settings to control single- vs double-quoted strings.

### 0.1.3

* Fixed colon used for identifying library in macro roll-option breaks highlighting.

### 0.1.2

* Fixed binary operators breaking quoted strings.

### 0.1.1

* Fixed omission in TextMate grammar causing statements without roll-options to not highlight.

See [Changelog](CHANGELOG.md) for past release notes.

## Roadmap

Planned features

* Improved Syntax Highlighting
  * Operator highlighting
  * Better multi-line macro support
* Semantic Highlighting
* MTScript Language Server
  * Better nested scope handling
  * Hover-text of built-in functions
  * Recognizing variables
  * Tracking UDFs
  * FoldingRangeProvider
