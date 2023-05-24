// https://github.com/mixxxdj/mixxx/wiki/Midi-Scripting

function doNothing() {}
var AutoController = {};

// status byte (opcode + channel), controller number, controller value
// XML file matches on status and controller number - bytes 1 and 2

AutoController.init = doNothing;
AutoController.shutdown = doNothing;

AutoController.timers = {
    gain: -1,
    volumeA: -1,
    volumeB: -1,
    parameter1A: -1,
    parameter1B: -1,
    parameter2A: -1,
    parameter2B: -1,
    parameter3A: -1,
    parameter3B: -1,
    bpmA: -1,
    bpmB: -1
}

const _master = "[Master]";
const _library = "[Library]";
const _channel = function(number) {
    return "[Channel" + (number + 1).toString() + "]";
}

const _eq = function(number) {
    return "[EqualizerRack1_" + _channel(number) + "_Effect1]";
}

const _hotcue = function(number) {
    return "hotcue_" + number + "_activate";
}

const _nudge = function(direction, size, group) {
    if (direction < 1) {
        return size ? group.concat('_down') : group.concat('_down_small');
    } else {
        return size ? group.concat('_up') : group.concat('_up_small');
    }
}

// deck-dependent groups have a deck suffix
const _stripGroup = function(group) {
    return group.substring(0, group.length - 1);
}

// deck-dependent groups have a deck suffix
const _affixGroup = function(group, suffix) {
    return group.concat(suffix);
}


const _checkTimer = function(engine, group) {
    // this if check may be unnecessary
    if (AutoController.timers[group] !== -1) {
        engine.stopTimer(AutoController.timers[group]);
        AutoController.timers[group] = -1;
    }
}

const navigateToPlaylists = function() {
    engine.setValue(_library, "MoveDown", 1);
    engine.setValue(_library, 'MoveDown', 1);
}

const goToItem = function() {
    engine.setValue(_library, 'GoToItem', 1);
}

const focusNode = function() {
    engine.setValue(_library, 'MoveFocusForward', 1);
}

const selectPlaylist = function(playlistId) {
    for (var i=0; i<playlistId; i++) {
        engine.setValue(_library, 'MoveDown', 1);
    }
    // seems 1000ms is enough of a threshold for actions to update first
    engine.beginTimer(1000, focusNode, true);   
}

// value: playlistId
AutoController.selectPlaylist = function(channel, control, value) {
    navigateToPlaylists();
    goToItem();
    selectPlaylist(value);
}

AutoController.selectTrack = function(channel, deck, value, status, group) {
    // replace this with generalized function for finding a track position
    engine.setParameter(_library, 'MoveVertical', value - 1);
    
    engine.setValue(_channel(deck), group, 1);
}

AutoController.cancelNudge = function(channel, control, value, status, group) {
    if (AutoController.timers[group] === -1) {
        print("Careful: timer for " + group + " is not yet in use.");
        return;
    }
    _checkTimer(engine, group);
}

AutoController.nudgeMaster = function(channel, size, direction, status, group) {
    _checkTimer(engine, group);
    const control =  _nudge(direction, size, group);
    const timerId = engine.beginTimer(200, function () {

        // Don't see it documented by Mixxx, but triggerControl runs a one-shot timer under the hood
        // triggerControl takes in a delay as its last param, in ms
        // 20ms is the fastest resolution
        script.triggerControl(_master, control, 20);
    }, false);
    AutoController.timers[group] = timerId;
}

AutoController.nudge = function(channel, deck, val, status, group) {
    _checkTimer(engine, group);

    // deck-dependent nudges encode both direction and size within val
    // even: nudge down, odd: nudge up ... 0-1: 1% adjust, 2-3: 4% adjust
    const control = _nudge(val % 2, Math.floor(val / 2), _stripGroup(group));
    const timerId = engine.beginTimer(200, function () {
        script.triggerControl(_channel(deck), control, 20);
    }, false);
    AutoController.timers[group] = timerId;
}

// A generalized nudge function with pattern matching would help
AutoController.nudgeEQ = function(channel, deck, val, status, group) {
    _checkTimer(engine, group);
   
    const control = _nudge(val % 2, Math.floor(val / 2), _stripGroup(group));
    const timerId = engine.beginTimer(200, function () {
        script.triggerControl(_eq(deck), control, 20);
    }, false);
    AutoController.timers[group] = timerId;
}

AutoController.set = function(channel, deck, value, status, group) {
    engine.setValue(_channel(deck), group, value);
}

AutoController.activateHotcue = function(channel, deck, number) {
    engine.setValue(_channel(deck), _hotcue(number), 1);
}

// var setCallback = function (value, control, group) {
//     midi.sendShortMsg(0x91, 0x11, 0x00);
// }


// var nudgeCallback = function (value, control, group) {
//     // this keyword refers to AutoController
//     midi.sendShortMsg(0, this.timers[group], value);
// }
