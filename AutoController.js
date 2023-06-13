// https://github.com/mixxxdj/mixxx/wiki/Midi-Scripting
function doNothing() {}

var AutoController = {};

// status byte (opcode + channel), controller number, controller value
// XML file matches on status and controller number - bytes 1 and 2

AutoController.init = init;
AutoController.shutdown = doNothing;

AutoController.timers = {
    gain: 0,
    volumeA: 0,
    volumeB: 0,
    parameter1A: 0,
    parameter1B: 0,
    parameter2A: 0,
    parameter2B: 0,
    parameter3A: 0,
    parameter3B: 0,
    bpmA: 0,
    bpmB: 0
}

const _stopTimer = function(timerId) {
    engine.stopTimer(timerId);
}

var scrollPosition = 1;
const valueAnswerStatus = 0x80;
const timeAnswerStatus = 0x81;
const _masterString = "[Master]";
const _libraryString = "[Library]";
const sortByPosition = 23;
const _channelString = function(number) {
    return "[Channel" + (number + 1).toString() + "]";
}

function init() {
    engine.setValue(_libraryString, 'sort_column', sortByPosition); // sort by position
    engine.setValue(_libraryString, 'sort_order', 0); // sort ascending
}

const _eqString = function(number) {
    return "[EqualizerRack1_" + _channelString(number) + "_Effect1]";
}

const _hotcue = function(number) {
    return "hotcue_" + number + "_activate";
}

const _nudge = function(direction, group) {
    return direction ? group.concat('_up') : group.concat('_down');
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
    if (AutoController.timers[group] !== 0) {
       _stopTimer(AutoController.timers[group]);
       AutoController.timers[group] = 0;
    }
}

const _navigateToPlaylist = function(id) {
    // from Mixxx launch
    engine.setValue(_libraryString, "MoveDown", 1);
    engine.setValue(_libraryString, 'MoveDown', 1);
    engine.setValue(_libraryString, 'GoToItem', 1);
    _selectPlaylist(id);
}

const _selectPlaylist = function(id) {
    for (var i=0; i<id; i++) {
        engine.setValue(_libraryString, 'MoveDown', 1);
    }
    // seems 1000ms is enough of a threshold for actions to update first
    engine.beginTimer(1000, init, true);
    engine.beginTimer(1300, _focusNode, true);
}

const _focusNode = function() {
    engine.setValue(_libraryString, 'MoveFocusForward', 1);
}

/* ------------------------------------------------------------------------------ */


AutoController.selectPlaylist = function(channel, control, id) {
    _navigateToPlaylist(id);
}

AutoController.selectTrack = function(channel, deck, value, status, group) {
    // expression for track position against current position
    const diff = value - scrollPosition;
    scrollPosition = value;
    
    engine.setValue(_libraryString, 'MoveVertical', diff);
    engine.setValue(_channelString(deck), group, 1);
}

AutoController.cancelNudge = function(channel, control, value, status, group) {
    if (AutoController.timers[group] === 0) {
        print("Careful: timer for " + group + " is not yet in use.");
        return;
    }
    _checkTimer(engine, group);
}

// maps a value into an inverted new range
const remapFlip = function map_range(value, low1, high1, high2, low2) {
    return high2 - (value / high1) * (high2 - low2);
}

AutoController.nudge = function(channel, deck, val, status, group) {
    const direction = val > 64;
    const min = (val < 64) ? 0 : 64;
    const max = (val < 64) ? 64 : 127;
    const speed = remapFlip(val, min, max, 500, 75);

    _checkTimer(engine, group);
    print("Status: " + status);

    const control = _nudge(direction, _stripGroup(group));
    var groupString = _channelString(deck);
    if (status >= 0x97 && status <= 0x99) {
        groupString = _eqString(deck);
    } else if (status === 0x9b) {
        groupString = _masterString;
    }
    const timerId = engine.beginTimer(speed, function () {
         script.triggerControl(groupString, control, 20);
    }, false);
    AutoController.timers[group] = timerId;
}

AutoController.set = function(channel, deck, value, status, group) {
    engine.setValue(_channelString(deck), group, value);
}

AutoController.activateHotcue = function(channel, deck, number) {
    engine.setValue(_channelString(deck), _hotcue(number), 1);
}

// reports requested single value back on the same channel
AutoController.askSingle = function(channel, deck, value, status, group) {

    // so...we have 7 bits to encode values. That's not enough, so represent it as sum of 2 data bytes
    const split = function(val) {
        const first = Math.floor(val / 2);
        const second = val - first;
        return [first, second];
    }
    const vals = split(engine.getValue(_channelString(deck), group));
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
    const vals = split(engine.getValue(_channelString(deck), group));
    midi.sendShortMsg(timeAnswerStatus, vals[0], vals[1]);
}
