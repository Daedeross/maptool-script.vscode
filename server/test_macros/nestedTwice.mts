[h, foreach(die, dice, ""), code: {
    [h: count = json.get(die, "count")]
    [h, if(count != 0), code: {
        [h: sides = json.get(die, "sides")]
        [h: expression = expression + strformat("%+dd%d", count, sides)]
    }]
}]