# Group Filter Feature — Implementation Plan

## Overview
Add a two-mode left sidebar: **Groups** view → **Channels** view. User presses Left arrow to open sidebar showing groups, selects a group to see its channels, presses Left again to go back to groups.

If playlist has no `group-title` → falls back to current behavior (channels directly).

## Flow
```
[Closed] → Left arrow → [Groups View] → Select group → [Channels View] → Left arrow → [Groups View] → Back → [Closed]
```

---

## Files to Change

### 1. `packages/player/src/utils.js` — Parse group-title

In `parseM3u()`, after line 39 (proxyMatch):
- Add: `const groupMatch = line.match(/\bgroup-title="([^"]*)"/);`
- On line 87 (channel object), add: `group: groupMatch ? groupMatch[1] : null`

### 2. `packages/player/index.html` — Add group-list div

Inside `#sidebar`, after `#channel-list` div (line 23), add:
```html
<div id="group-list" class="group-list hidden"></div>
```

### 3. `packages/player/src/ui.js` — Two-mode sidebar

**New state variables** (after line 6):
```js
let sidebarMode = 'channels'; // 'groups' or 'channels'
let groups = [];
let selectedGroup = null;
let groupFocusedIndex = 0;
```

**New function: extractGroups(channelList)** — called from `init()` and `refreshChannelList()`:
- Builds `groups[]` = `[{ name, count, channels: [] }]` from non-null groups
- Sorts alphabetically by name
- If groups array is empty → set `sidebarMode = 'channels'`
- If groups exist → set `sidebarMode = 'groups'`

**New function: renderGroupList()**:
- Renders into `#group-list`
- Each item: `escapeHtml(group.name)` + `<span class="group-count">(` + group.count + `)</span>`
- Focus/highlight on `groupFocusedIndex`
- Click handler → `showGroupChannels(group.name)`

**New function: showGroupChannels(groupName)**:
- Sets `selectedGroup = groupName`
- Sets `sidebarMode = 'channels'`
- Hides `#group-list`, shows `#channel-list`
- Calls `renderChannelList()` filtered to that group
- Resets `focusedIndex = 0`, calls `updateFocus()`

**New function: showGroupList()**:
- Sets `sidebarMode = 'groups'`
- Hides `#channel-list`, shows `#group-list`
- Calls `renderGroupList()`

**New functions: navigateGroupUp() / navigateGroupDown()**:
- Navigate `groupFocusedIndex` within `groups[]`
- Update focus styling, scroll into view

**New function: selectFocusedGroup()**:
- Calls `showGroupChannels(groups[groupFocusedIndex].name)`

**New function: getSidebarMode()**:
- Returns `sidebarMode`

**Modified: renderChannelList()**:
- If `selectedGroup` is set → filter channels by group
- If null → render all channels (current behavior)

**Modified: refreshChannelList(newChannels)**:
- Calls `extractGroups(newChannels)`
- If `sidebarMode === 'groups'` → `renderGroupList()`
- Else if `selectedGroup` → `renderChannelList()` (filtered)
- Else → `renderChannelList()` (all)

**Modified: jumpToNumber(num)**:
- Searches within currently visible (filtered) channels

### 4. `packages/player/src/main.js` — Remote control for two modes

In `handleRemoteAction()`, replace the `if (ui.isSidebarOpen())` block:

```js
if (ui.isSidebarOpen()) {
  const mode = ui.getSidebarMode();
  if (mode === 'groups') {
    switch (action) {
      case 'up': ui.navigateGroupUp(); break;
      case 'down': ui.navigateGroupDown(); break;
      case 'select': ui.selectFocusedGroup(); break;
      case 'left': ui.toggleSidebar(); break;
      case 'right': ui.toggleSidebar(); ui.toggleRightSidebar(); break;
      case 'back': ui.toggleSidebar(); break;
      case 'number': ui.jumpToNumber(value); break;
    }
  } else {
    switch (action) {
      case 'up': ui.navigateUp(); break;
      case 'down': ui.navigateDown(); break;
      case 'select': ui.selectFocusedGroup ? ui.selectFocusedGroup() : ui.selectFocused(); break;
      case 'left': if (groupsExist()) ui.showGroupList(); else ui.toggleSidebar(); break;
      case 'right': ui.toggleSidebar(); ui.toggleRightSidebar(); break;
      case 'back': if (groupsExist()) ui.showGroupList(); else ui.toggleSidebar(); break;
      case 'number': ui.jumpToNumber(value); break;
    }
  }
  return;
}
```

Also need a `groupsExist()` helper that checks if `ui.getGroups().length > 0`.

**Modified: the closed-sidebar 'left' case**:
```js
case 'left':
  ui.toggleSidebar();  // This will open in groups mode if groups exist
  break;
```

In `ui.toggleSidebar()`:
- When opening, if groups exist → show groups view
- When opening, if no groups → show channels view (current behavior)

### 5. `packages/player/src/styles.css` — Group list styles

Add after `.channel-list` styles:
```css
.group-list {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
}
.group-list::-webkit-scrollbar { display: none; }

.group-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 28px;
  padding: clamp(10px, 1.5vw, 18px) clamp(16px, 3vw, 28px);
  cursor: pointer;
  border-bottom: 1px solid #1a1a1a;
  transition: background 0.1s;
}
.group-item:hover, .group-item.focused {
  background: #242424;
  box-shadow: inset 4px 0 0 #4fc3f7, 0 0 12px rgba(79, 195, 247, 0.35);
}
.group-item.focused .group-name { color: #fff; font-weight: 600; }
.group-item.active { background: #0d47a1; box-shadow: inset 4px 0 0 #4fc3f7; }

.group-item .group-name {
  flex: 1;
  font-size: 21px;
  font-size: clamp(14px, 2vw, 21px);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.group-item .group-count {
  font-size: 18px;
  font-size: clamp(12px, 1.6vw, 18px);
  color: #4fc3f7;
  font-weight: 600;
  margin-left: 10px;
  flex-shrink: 0;
}
.group-item.focused .group-count { color: #fff; }
.group-item.active .group-count { color: #fff; }
```

---

## Backward Compatibility

- No channels have `group` → `groups[]` is empty → sidebar opens in `channels` mode → identical to current behavior
- `ui.isSidebarOpen()` works the same (sidebar open in either mode)
- All existing navigation/remote functions work when no groups present
