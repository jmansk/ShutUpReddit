# ShutUpReddit

A Chrome/Brave/Edge browser extension (Manifest V3) that filters Reddit posts directly in the DOM, allowing you to customize your Reddit experience by hiding unwanted content and focusing on what matters to you.

## 💝 Support This Project

If you find ShutUpReddit useful, consider [tipping the developer](https://buy.stripe.com/aFa6oG5NN0j621IdLx2Nq00). Tips go towards my son's Christmas present! 🎄

**[Tip via Stripe →](https://buy.stripe.com/aFa6oG5NN0j621IdLx2Nq00)**

## Features

### 🚫 Blocking Filters
- **Blocked Keywords**: Hide posts containing specific keywords (case-insensitive)
  - **Configurable matching**: Choose to match keywords in titles, content, and/or author names
  - Default: Matches in titles and content
- **Blocked Subreddits**: Filter out entire subreddits
- **Blocked Users**: Hide posts from specific Reddit users
- **Blocked Domains**: Filter posts linking to specific domains (ready for future implementation)
- **Blocked Flairs**: Filter posts with specific flair text (ready for future implementation)

### 🎯 Focus Mode
- **Focus Keywords**: Show only posts that match at least one focus keyword
  - **Configurable matching**: Choose to match keywords in titles, content, and/or author names
  - Default: Matches in titles, content, and authors
- **OR Logic**: With multiple focus keywords, posts matching any keyword will be shown
- **Smart Matching**: Only checks the fields you've enabled for keyword matches

### 📊 Statistics
- Track total posts processed, hidden, and shown
- Breakdown by filter type (keywords, focus mode, subreddits, users)
- Reset statistics at any time

### ⚡ Real-time Updates
- Rules update instantly without page reload
- Dynamic filtering as you scroll
- Works on both Reddit feed pages and search results

### 🎨 User-Friendly Interface
- Clean, modern popup UI
- Visual status indicators (enabled/disabled/paused)
- Easy keyword management with add/remove functionality
- Summary chips showing rule counts

## Installation

### From Source

1. **Clone or download this repository**
   ```bash
   git clone https://github.com/jmansk/ShutUpReddit.git
   cd ShutUpReddit
   ```

2. **Load the extension in Chrome/Brave/Edge**
   - Open your browser and navigate to the extensions page:
     - Chrome: `chrome://extensions/`
     - Brave: `brave://extensions/`
     - Edge: `edge://extensions/`
   - Enable "Developer mode" (toggle in the top right)
   - Click "Load unpacked"
   - Select the `ShutUpReddit` directory

3. **Verify installation**
   - You should see the ShutUpReddit extension in your extensions list
   - Click the extension icon to open the popup and verify it's working

## Usage

### Basic Filtering

1. **Open the extension popup** by clicking the ShutUpReddit icon in your browser toolbar

2. **Add blocked keywords**:
   - Configure where to match keywords using the checkboxes:
     - ☑ Match in titles (default: enabled)
     - ☑ Match in content (default: enabled)
     - ☐ Match in authors (default: disabled)
   - Type a keyword in the "Blocked Keywords" input field
   - Click "Add" or press Enter
   - Posts containing that keyword in the selected fields will be hidden

3. **Block subreddits or users**:
   - Currently managed via the options page (JSON view)
   - Future UI updates will add direct management in the popup

### Focus Mode

1. **Enable Focus Mode**:
   - Toggle the "Only show posts matching focus keywords" checkbox
   - Configure where to match keywords using the checkboxes:
     - ☑ Match in titles (default: enabled)
     - ☑ Match in content (default: enabled)
     - ☑ Match in authors (default: enabled)
   - Add focus keywords using the input field
   - Only posts matching at least one focus keyword in the selected fields will be shown

2. **Focus Mode Logic**:
   - With keywords ["entrepreneurship", "SaaS"]:
     - Posts with "entrepreneurship" in any enabled field → ✅ Shown
     - Posts with "SaaS" in any enabled field → ✅ Shown
     - Posts with both → ✅ Shown
     - Posts with neither in any enabled field → ❌ Hidden

3. **Customizing Match Fields**:
   - Uncheck fields you don't want to search
   - Example: Only check "Match in titles" to show posts based solely on title matches
   - Changes apply immediately without page reload

### Pause Functionality

- Click "Pause for 30 minutes" to temporarily disable filtering
- Useful when you want to see all posts temporarily
- Automatically resumes after 30 minutes

### View Statistics

- Open the popup to see real-time statistics
- Statistics update every 2 seconds while the popup is open
- Click "Reset Statistics" to clear all stats

## Project Structure

```
ShutUpReddit/
├── manifest.json          # Extension manifest (MV3)
├── background.js          # Service worker (rules storage, message handling)
├── content.js             # Content script (DOM filtering logic)
├── popup.html             # Popup UI markup
├── popup.js               # Popup UI logic
├── options.html           # Options page markup
├── options.js             # Options page logic
├── icons/                 # Extension icons
│   ├── icon16.png
│   ├── icon32.png
│   ├── icon48.png
│   └── icon128.png
└── README.md              # This file
```

## Technical Details

### Architecture

- **Manifest V3**: Built for Chrome Extension Manifest V3
- **Service Worker**: `background.js` handles rules storage and message passing
- **Content Script**: `content.js` injects into Reddit pages and filters posts in real-time
- **Storage**: Uses `chrome.storage.local` for persistent rule and statistics storage

### Key Technologies

- **Vanilla JavaScript**: No external dependencies
- **MutationObserver**: Detects new posts as you scroll
- **DOM Manipulation**: Hides posts by setting `display: none`
- **Message Passing**: Communication between popup, background, and content scripts

### Filtering Logic

1. **Post Detection**: Uses selectors for Reddit's post elements (`shreddit-post`, `div[data-testid="post-container"]`, etc.)
2. **Data Extraction**: Extracts title, content, subreddit, and author from post elements
3. **Rule Evaluation**: Applies blocking and focus mode rules
4. **DOM Hiding**: Hides matching posts by hiding their container elements

### Search Results Support

- Automatically detects when on Reddit search pages (`/search/`)
- Uses different selectors for search result posts
- Extracts data from search result anchors
- Applies same filtering rules as feed posts

## Development

### Prerequisites

- A Chromium-based browser (Chrome, Brave, Edge)
- Basic knowledge of JavaScript and browser extensions

### Development Workflow

1. **Make changes** to the source files
2. **Reload the extension** in `chrome://extensions/` (click the reload icon)
3. **Test on Reddit** by navigating to `https://www.reddit.com`
4. **Check console** for debug logs (prefixed with `[ShutUpReddit]`)

### Debug Mode

To enable verbose logging, set `DEBUG_MODE = true` in `content.js`:

```javascript
const DEBUG_MODE = true;
```

This will log detailed information about post detection and filtering.

### Message Types

The extension uses the following message types for communication:

- `GET_RULES`: Retrieve current rules from storage
- `SAVE_RULES`: Save updated rules to storage
- `RESET_RULES`: Reset rules to defaults
- `SET_ENABLED`: Toggle extension enabled/disabled
- `PAUSE_FOR_30_MINUTES`: Pause filtering for 30 minutes
- `ADD_RULE`: Add a rule to a specific rule array
- `GET_STATS`: Retrieve statistics
- `RESET_STATS`: Reset statistics to zero

## Browser Compatibility

- ✅ Chrome (Manifest V3)
- ✅ Brave (Manifest V3)
- ✅ Edge (Manifest V3)
- ❌ Firefox (uses Manifest V2, would require porting)

## Known Limitations

- Statistics are stored locally and reset if extension is uninstalled
- Options page currently only shows JSON view (UI improvements planned)
- Some rule types (domains, flairs) are defined but not yet fully implemented in the UI
- Score and age-based filtering are defined in the data model but not yet implemented

## Future Enhancements

- [ ] UI for managing blocked subreddits, users, domains, and flairs
- [ ] Score-based filtering (hide posts below a certain score)
- [ ] Age-based filtering (hide posts older than X hours)
- [ ] Export/import rules functionality
- [ ] Keyboard shortcuts
- [ ] Whitelist mode (opposite of focus mode)
- [ ] Advanced keyword matching (regex support)

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request. For major changes, please open an issue first to discuss what you would like to change.

## License

This project is open source and available under the [MIT License](LICENSE).

## Acknowledgments

Built to improve the Reddit browsing experience by giving users more control over their feed content.

**Support the project:** If you enjoy using ShutUpReddit, [consider leaving a tip](https://buy.stripe.com/aFa6oG5NN0j621IdLx2Nq00). Your support helps fund my son's Christmas present! 🎁

---

**Note**: This extension is not affiliated with Reddit, Inc. It's a third-party tool that modifies the Reddit website's DOM in your browser.

