[h, if(count != 0), code: {
    [h: sides = json.get(die, "sides")]
    [h: expression = expression + strformat("%+dd%d", count, sides)]
}]

[for(i, 0, 10, 1), code: {
    [h: foo = i]
    [h: bar = foo^2]
    [r: foo + bar]
}]
