/**
 * Gamepad module for Pro control scheme.
 * Polls connected gamepads via the Gamepad API and maps Xbox-style
 * controller buttons to J2ME keycodes for the emulator.
 */

// Xbox Standard Gamepad button → J2ME keycode mapping
const BUTTON_MAP = {
    0:  13,   // A → Enter (OK / Action)
    1:  113,  // B → F2 (Right Soft Key / Back)
    2:  53,   // X → Digit5 (Fire / Interact)
    3:  48,   // Y → Digit0
    4:  112,  // LB → F1 (Left Soft Key)
    5:  113,  // RB → F2 (Right Soft Key)
    6:  106,  // LT → NumpadMultiply (*)
    7:  111,  // RT → NumpadDivide (#)
    12: 38,   // D-Pad Up → ArrowUp
    13: 40,   // D-Pad Down → ArrowDown
    14: 37,   // D-Pad Left → ArrowLeft
    15: 39,   // D-Pad Right → ArrowRight
};

// Button name labels for UI display
export const BUTTON_NAMES = {
    0: 'A', 1: 'B', 2: 'X', 3: 'Y',
    4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
    8: 'Back', 9: 'Start',
    10: 'L3', 11: 'R3',
    12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right',
};

// Axis thresholds for analog sticks (treat as d-pad)
const AXIS_THRESHOLD = 0.5;

// Axis → keycode mapping (left stick as d-pad fallback)
const AXIS_MAP = {
    leftX_neg: 37,  // Left stick left → ArrowLeft
    leftX_pos: 39,  // Left stick right → ArrowRight
    leftY_neg: 38,  // Left stick up → ArrowUp
    leftY_pos: 40,  // Left stick down → ArrowDown
};

let pollingActive = false;
let animFrameId = null;
let eventCallback = null;
let previousButtonStates = {};
let previousAxisStates = {};
let connectedGamepad = null;

/**
 * Trigger haptic feedback on the connected gamepad.
 * @param {Gamepad} gamepad
 * @param {number} duration - Duration in ms
 * @param {number} strong - Strong motor magnitude (0-1)
 * @param {number} weak - Weak motor magnitude (0-1)
 */
function triggerHaptic(gamepad, duration = 50, strong = 0.3, weak = 0.5) {
    if (!gamepad) return;

    // Chrome/Edge vibrationActuator API
    if (gamepad.vibrationActuator) {
        try {
            gamepad.vibrationActuator.playEffect('dual-rumble', {
                startDelay: 0,
                duration: duration,
                strongMagnitude: strong,
                weakMagnitude: weak,
            });
        } catch (e) {
            // Silently fail if vibration not supported
        }
    }
    // Firefox hapticActuators API (older)
    else if (gamepad.hapticActuators && gamepad.hapticActuators.length > 0) {
        try {
            gamepad.hapticActuators[0].pulse(weak, duration);
        } catch (e) {
            // Silently fail
        }
    }
}

/**
 * Get the first connected gamepad, or null.
 * @returns {Gamepad|null}
 */
function getGamepad() {
    const gamepads = navigator.getGamepads();
    for (let i = 0; i < gamepads.length; i++) {
        if (gamepads[i]) return gamepads[i];
    }
    return null;
}

/**
 * Main polling loop — checks button/axis states and fires events.
 */
function pollLoop() {
    if (!pollingActive) return;

    const gamepad = getGamepad();

    if (gamepad) {
        // --- Button polling ---
        for (const [btnIdx, keycode] of Object.entries(BUTTON_MAP)) {
            const idx = parseInt(btnIdx);
            const button = gamepad.buttons[idx];
            if (!button) continue;

            const isPressed = button.pressed;
            const wasPressed = previousButtonStates[idx] || false;

            if (isPressed && !wasPressed) {
                // Button just pressed
                triggerHaptic(gamepad);
                if (eventCallback) {
                    eventCallback('down', keycode, {
                        symbol: '\x00',
                        ctrlKey: false,
                        shiftKey: false,
                        gamepadButton: idx,
                    });
                }
            } else if (!isPressed && wasPressed) {
                // Button just released
                if (eventCallback) {
                    eventCallback('up', keycode, {
                        symbol: '\x00',
                        ctrlKey: false,
                        shiftKey: false,
                        gamepadButton: idx,
                    });
                }
            }

            previousButtonStates[idx] = isPressed;
        }

        // --- Left stick as D-pad ---
        if (gamepad.axes.length >= 2) {
            const lx = gamepad.axes[0];
            const ly = gamepad.axes[1];

            const axisStates = {
                leftX_neg: lx < -AXIS_THRESHOLD,
                leftX_pos: lx > AXIS_THRESHOLD,
                leftY_neg: ly < -AXIS_THRESHOLD,
                leftY_pos: ly > AXIS_THRESHOLD,
            };

            for (const [axisKey, keycode] of Object.entries(AXIS_MAP)) {
                const isActive = axisStates[axisKey];
                const wasActive = previousAxisStates[axisKey] || false;

                if (isActive && !wasActive) {
                    triggerHaptic(gamepad, 30, 0.15, 0.25);
                    if (eventCallback) {
                        eventCallback('down', keycode, {
                            symbol: '\x00',
                            ctrlKey: false,
                            shiftKey: false,
                            gamepadAxis: axisKey,
                        });
                    }
                } else if (!isActive && wasActive) {
                    if (eventCallback) {
                        eventCallback('up', keycode, {
                            symbol: '\x00',
                            ctrlKey: false,
                            shiftKey: false,
                            gamepadAxis: axisKey,
                        });
                    }
                }

                previousAxisStates[axisKey] = isActive;
            }
        }
    }

    animFrameId = requestAnimationFrame(pollLoop);
}

/**
 * Start polling for gamepad input.
 * @param {(type: string, keycode: number, args: object) => void} callback
 *   Called with 'down' or 'up', the J2ME keycode, and extra args.
 */
export function startGamepadPolling(callback) {
    eventCallback = callback;
    pollingActive = true;
    previousButtonStates = {};
    previousAxisStates = {};
    pollLoop();
}

/**
 * Stop polling for gamepad input.
 */
export function stopGamepadPolling() {
    pollingActive = false;
    eventCallback = null;
    if (animFrameId) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
    }
    previousButtonStates = {};
    previousAxisStates = {};
}

/**
 * Set up gamepad connect/disconnect event listeners.
 * @param {(connected: boolean, gamepad: Gamepad) => void} statusCallback
 */
export function setupGamepadListeners(statusCallback) {
    window.addEventListener('gamepadconnected', (e) => {
        connectedGamepad = e.gamepad;
        if (statusCallback) statusCallback(true, e.gamepad);
    });

    window.addEventListener('gamepaddisconnected', (e) => {
        connectedGamepad = null;
        if (statusCallback) statusCallback(false, e.gamepad);
    });
}

/**
 * Check if any gamepad is currently connected.
 * @returns {boolean}
 */
export function isGamepadConnected() {
    return getGamepad() !== null;
}

/**
 * Get the name/id of the connected gamepad.
 * @returns {string|null}
 */
export function getGamepadName() {
    const gp = getGamepad();
    return gp ? gp.id : null;
}

export { BUTTON_MAP };
