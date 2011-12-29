
var statuses = {
	READY:       0,
	AUTHORIZING: 1,
	DOWNLOADING: 2,
	PARSING:     3,
	MERGING:     4,
	UPLOADING:   5,
}

var browser;


var isPopupOpen = false;

var debug = false;

// webLinks doesn't include browser links (obvious)
var webLinks = [];
var enabledWebLinks = [];
var tagStructuredWebLinks = [];
var messageListeners = [];
// the amount of links that have started with the start of the extension but have not yet finished
var startingLinksAfterInit;

