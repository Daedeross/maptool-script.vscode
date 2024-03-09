parser grammar MTScriptParser;

options { tokenVocab=MTScriptLexer; }

macro
    : bit* EOF
    ;

bit
    : TEXT | macroScript
    ;

macroScript
    : (OPEN_SCRIPT | OPEN_SUB_SCRIPT) script CLOSE_SCRIPT
    ;

script
    : switchCode
    | switch
    | ifThen
    | ifThenCode
    | simpleScript
    ;

simpleScript
    : (rollOptions COLON)? scriptBody
    ;

ifThen
    : (rollOptions COMMA)? KEYWORD_IF LPAREN expression RPAREN
      rollOptions? COLON statement SEMI statement
    ;

ifThenCode
    : (rollOptions COMMA)? KEYWORD_IF LPAREN expression RPAREN
      rollOptions? COMMA KEYWORD_CODE COLON block SEMI block
    ;

switch
    : (rollOptions COMMA)? KEYWORD_SWITCH
      LPAREN expression RPAREN
      rollOptions? COLON
      switchBody
    ;

switchCode
    : (rollOptions COMMA)? KEYWORD_SWITCH
      LPAREN expression RPAREN COMMA KEYWORD_CODE COLON
      switchCodeBody
    ;

switchBody
    : switchCase* (KEYWORD_DEFAULT COLON statement)?
    ;

switchCodeBody
    : switchCodeCase* (KEYWORD_DEFAULT COLON block)?
    ;

switchCase
    : KEYWORD_CASE atom COLON statement SEMI
    ;

switchCodeCase
    : KEYWORD_CASE atom COLON block SEMI
    ;

rollOptions
    : optionsList
    ;

optionsList
    : option (COMMA option)*
    ;

option
    : simple_option
    | function_option LPAREN argList RPAREN
    ;

simple_option
    : KEYWORD_CODE
    | KEYWORD_EXPANDED
    | KEYWORD_GM
    | KEYWORD_GMTT
    | KEYWORD_HIDE
    | KEYWORD_RESULT
    | KEYWORD_SELF
    | KEYWORD_SELFT
    | KEYWORD_TOOLTIP
    | KEYWORD_UNFORMATTED
    ;

function_option
    : KEYWORD_COUNT
    | KEYWORD_DIALOG
    | KEYWORD_FOR
    | KEYWORD_FOREACH
    | KEYWORD_FRAME
    | KEYWORD_IF
    | KEYWORD_MACRO
    | KEYWORD_OVERLAY
    | KEYWORD_TOOLTIP
    | KEYWORD_TOKEN
    | KEYWORD_WHILE
    | KEYWORD_WHISPER
    ;

scriptBody      : statement
                | block;

block
    : LBRACE scripts RBRACE
    ;

statement
    : assignment
    | expression
    ;

scripts
    : bit+
    ;

assignment
    : variable ASSIGN expression
    ;

expression
    : LPAREN expression RPAREN                                      #parentheticalExpression
    | function                                                      #functionCall
    | atom                                                          #atomicExpression
    | expression POW expression                                     #powerExpression
    | op=(PLUS | MINUS) expression                                  #numericUnaryExpression
    | expression op=(TIMES | DIV) expression                        #mulDivExpression
    | expression op=(PLUS | MINUS) expression                       #addSubExpression
    | NOT expression                                                #booleanUnaryExpression
    | expression op=(GT | LT | EQ | NEQ | GEQ | LEQ) expression     #comparisonExpression
    | expression op=(AND | OR) expression                           #booleanBinaryExpression
    | expression QMARK expression COLON expression                  #ternaryExpression
    ;

atom : numeric_literal | boolean_literal | string_literal | variable ;
string_literal : NORMALSTRING | CHARSTRING ;
numeric_literal : (INT | HEX | FLOAT | HEX_FLOAT) ;
boolean_literal : KEYWORD_TRUE | KEYWORD_FALSE ;

function : variable LPAREN argList RPAREN ;
argList : expression (COMMA expression)* ;

variable
    : identifier
    | identifier DOT identifier
    ;

identifier
    : IDENTIFIER
    | keyword
    ;

keyword
    : KEYWORD_CASE
    | KEYWORD_TRUE
    | KEYWORD_FALSE
    | KEYWORD_CODE
    | KEYWORD_COUNT
    | KEYWORD_DIALOG
    | KEYWORD_EXPANDED
    | KEYWORD_FOR
    | KEYWORD_FOREACH
    | KEYWORD_FRAME
    | KEYWORD_GM
    | KEYWORD_GMTT
    | KEYWORD_HIDE
    | KEYWORD_IF
    | KEYWORD_MACRO
    | KEYWORD_OVERLAY
    | KEYWORD_RESULT
    | KEYWORD_SELF
    | KEYWORD_SELFT
    | KEYWORD_SWITCH
    | KEYWORD_TOOLTIP
    | KEYWORD_TOKEN
    | KEYWORD_UNFORMATTED
    | KEYWORD_WHILE
    | KEYWORD_WHISPER
    ;