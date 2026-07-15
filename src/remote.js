let onKeyAction = null;
let numberBuffer = '';
let numberTimeout = null;

export function init(callback) {
  onKeyAction = callback;

  document.addEventListener('keydown', handleKeyDown);
}

export function destroy() {
  document.removeEventListener('keydown', handleKeyDown);
  onKeyAction = null;
}

function handleKeyDown(e) {
  if (!onKeyAction) return;

  const key = e.key || e.keyCode;

  // Prevent default for handled keys
  const handled = [
    'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Enter', 'Escape', 'Backspace', ' ',
    37, 38, 39, 40, 13, 27, 32, // keyCodes
  ];

  if (handled.includes(key) || handled.includes(e.keyCode)) {
    e.preventDefault();
  }

  // Samsung remote special keys (some TVs use these)
  const samsungKeys = {
    'ColorRed': 'red',
    'ColorGreen': 'green',
    'ColorYellow': 'yellow',
    'ColorBlue': 'blue',
    'MediaPlayPause': 'playpause',
    'MediaPlay': 'play',
    'MediaPause': 'pause',
    'MediaStop': 'stop',
    'MediaTrackNext': 'next',
    'MediaTrackPrevious': 'prev',
    'ChUp': 'channelUp',
    'ChDown': 'channelDown',
    'VolumeUp': 'volumeUp',
    'VolumeDown': 'volumeDown',
    'VolumeMute': 'mute',
  };

  // Arrow keys
  if (key === 'ArrowUp' || e.keyCode === 38) {
    onKeyAction('up');
    return;
  }
  if (key === 'ArrowDown' || e.keyCode === 40) {
    onKeyAction('down');
    return;
  }
  if (key === 'ArrowLeft' || e.keyCode === 37) {
    onKeyAction('left');
    return;
  }
  if (key === 'ArrowRight' || e.keyCode === 39) {
    onKeyAction('right');
    return;
  }

  // Enter / OK
  if (key === 'Enter' || e.keyCode === 13) {
    onKeyAction('select');
    return;
  }

  // Back / Escape
  if (key === 'Escape' || key === 'Backspace' || e.keyCode === 27) {
    onKeyAction('back');
    return;
  }

  // Play/Pause (space or media key)
  if (key === ' ' || e.keyCode === 32) {
    onKeyAction('playpause');
    return;
  }

  // Samsung special keys
  if (samsungKeys[key]) {
    onKeyAction(samsungKeys[key]);
    return;
  }

  // Number keys (0-9)
  if (/^[0-9]$/.test(key)) {
    handleNumberInput(key);
    return;
  }

  // Also handle keyCode for number keys (some remotes)
  if (e.keyCode >= 48 && e.keyCode <= 57) {
    const num = e.keyCode - 48;
    handleNumberInput(String(num));
    return;
  }
}

function handleNumberInput(num) {
  numberBuffer += num;

  // Clear previous timeout
  if (numberTimeout) {
    clearTimeout(numberTimeout);
  }

  // Wait 500ms for more digits, then jump to channel
  numberTimeout = setTimeout(() => {
    if (onKeyAction && numberBuffer) {
      onKeyAction('number', parseInt(numberBuffer, 10));
    }
    numberBuffer = '';
  }, 500);
}
