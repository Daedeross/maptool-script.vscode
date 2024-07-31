# Maptool VSCode Language Support

Visual Studio Code extension for MapTool macro script language support.
![Completion suggestions](images/Completion_Suggestions.gif)
![Sample](images/sample-script.png)

## Features

Basic syntax highlighting for MapTool script.

* Roll Options.
* *Most* nested macros.
* Special variables.
* Separate scopes for built-in vs user-defined fuctions.
  * By default built-in functions are bold, but that can be customized by theme.
* RPEdit formatting support.
* Code-Completion suggestions

* Hover with function signatures and error reporting

![Hover example](images/Hover_with_error.png)

![Multi-part example](images/multi-part-macro.png)

## Extension Settings

None yet. :/

## Known Issues

This is very basic. So depending on your coding style it may not catch everything.

## Release Notes

### 1.0.0-alpha1

* REMOVED most TextMate based highlighting in favor of ANTLR4-based parsing.
* ADDED Language server w/client
  * Sematic tokens
  * Tree visitor
  * Variable usage before assignment waring.
  * For-loop argument validation.
  * Function and roll-option argument count validation
  * Built-in function onHover information.
  * Roll-option onHover information.
  * Completion suggestions.

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
