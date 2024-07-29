parser grammar MTScriptParser;

options { tokenVocab=MTScriptLexer; }

macro
    : bit* EOF
    ;

bit
    : TEXT
    | macroScript
    ;

macroScript
    : (OPEN_SCRIPT | OPEN_SUB_SCRIPT) script CLOSE_SCRIPT
    ;

script
    : switchCode        #switchCodeScript
    | switch            #switchScript
    | ifThen            #ifThenScript
    | ifThenCode        #ifThenCodeScript
    | simpleScript      #simple
    | WS*               #blankScript
    ;

simpleScript
    : (rollOptions COLON)? scriptBody
    ;

ifThen
    : (rollOptions COMMA)? KEYWORD_IF LPAREN expression RPAREN
      rollOptions? COLON true=statement SEMI false=statement
    ;

ifThenCode
    : (rollOptions COMMA)? KEYWORD_IF LPAREN expression RPAREN
      rollOptions? COMMA KEYWORD_CODE COLON true=block SEMI false=block
    ;

switch
    : (first=rollOptions COMMA)? KEYWORD_SWITCH
      LPAREN expression RPAREN
      second=rollOptions? COLON
      switchBody
    ;

switchCode
    : (first=rollOptions COMMA)? KEYWORD_SWITCH
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
    : option (COMMA option)*
    ;

option
    : simple_option
    | function_option LPAREN argList RPAREN
    | for_option
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
    | KEYWORD_FRAME
    | KEYWORD_IF
    | KEYWORD_MACRO
    | KEYWORD_OVERLAY
    | KEYWORD_TOOLTIP
    | KEYWORD_TOKEN
    | KEYWORD_WHILE
    | KEYWORD_WHISPER
    ;

for_option
    : for=(KEYWORD_FOR | KEYWORD_FOREACH) LPAREN variable (COMMA expression)* RPAREN
    | for=(KEYWORD_FOR | KEYWORD_FOREACH) LPAREN invalid=expression (COMMA expression)* RPAREN
    ;

scriptBody
    : statement
    | block
    ;

block
    : LBRACE scripts RBRACE
    ;

scripts
    : bit+
    ;

statement
    : assignment
    | expression
    ;

assignment
    : variable ASSIGN expression
    ;

expression
    : LPAREN expression RPAREN                                              #parentheticalExpression
    | function                                                              #functionCall
    | atom                                                                  #atomicExpression
    | left=expression POW right=expression                                  #powerExpression
    | op=(PLUS | MINUS) right=expression                                    #numericUnaryExpression
    | left=expression op=(TIMES | DIV) right=expression                     #mulDivExpression
    | left=expression op=(PLUS | MINUS) right=expression                    #addSubExpression
    | NOT expression                                                        #booleanUnaryExpression
    | left=expression op=(GT | LT | EQ | NEQ | GEQ | LEQ) right=expression  #comparisonExpression
    | left=expression op=(AND | OR) right=expression                        #booleanBinaryExpression
    //| predicate=expression QMARK true=expression COLON false=expression     #ternaryExpression
    ;

atom : numeric_literal | boolean_literal | string_literal | variable ;
string_literal : NORMALSTRING | CHARSTRING ;
numeric_literal : (INT | HEX | FLOAT | HEX_FLOAT) ;
boolean_literal : KEYWORD_TRUE | KEYWORD_FALSE ;

function : variable LPAREN argList RPAREN ;
argList : expression? (COMMA expression)* ;

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