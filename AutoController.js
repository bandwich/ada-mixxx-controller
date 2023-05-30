// https://github.com/mixxxdj/mixxx/wiki/Midi-Scripting
function doNothing() {}

var AutoController = {};

// status byte (opcode + channel), controller number, controller value
// XML file matches on status and controller number - bytes 1 and 2

AutoController.init = init;
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

var scrollPosition = 1;
const valueAnswerStatus = 0x80;
const timeAnswerStatus = 0x81;
const _master = "[Master]";
const _library = "[Library]";
const sortByPosition = 23;
const _channel = function(number) {
    return "[Channel" + (number + 1).toString() + "]";
}

function init() {
    engine.setValue(_library, 'sort_column', sortByPosition); // sort by position
    engine.setValue(_library, 'sort_order', 0); // sort ascending
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

const _navigateToPlaylist = function(id) {
    // from Mixxx launch
    engine.setValue(_library, "MoveDown", 1);
    engine.setValue(_library, 'MoveDown', 1);
    engine.setValue(_library, 'GoToItem', 1);
    _selectPlaylist(id);
}

const _selectPlaylist = function(id) {
    for (var i=0; i<id; i++) {
        engine.setValue(_library, 'MoveDown', 1);
    }
    // seems 1000ms is enough of a threshold for actions to update first
    engine.beginTimer(1000, init, true);
    engine.beginTimer(1300, _focusNode, true);
}

const _focusNode = function() {
    engine.setValue(_library, 'MoveFocusForward', 1);
}


/* ------------------------------------------------------------------------------ */


AutoController.selectPlaylist = function(channel, control, id) {
    _navigateToPlaylist(id);
}

AutoController.selectTrack = function(channel, deck, value, status, group) {
    // expression for track position against current position
    const diff = value - scrollPosition;
    scrollPosition = value;
    
    engine.setValue(_library, 'MoveVertical', diff);
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

// reports requested single value back on the same channel
AutoController.askSingle = function(channel, deck, value, status, group) {

    // so...we have 7 bits to encode values. That's not enough, so represent it as sum of 2 data bytes
    const split = function(val) {
        const first = Math.floor(val / 2);
        const second = val - first;
        return [first, second];
    }
    const vals = split(engine.getValue(_channel(deck), group));
    midi.sendShortMsg(valueAnswerStatus, vals[0], vals[1]);
}

// reports requested time value back on the same channel
AutoController.askTime = function(channel, deck, value, status, group) {

    // Represent time not as seconds but as [minutes, seconds]
    const split = function(val) {
        const minutes = Math.floor(val / 60);
        const seconds = val % 60;
        return [minutes, seconds];
    }
    const vals = split(engine.getValue(_channel(deck), group));
    midi.sendShortMsg(timeAnswerStatus, vals[0], vals[1]);
}
