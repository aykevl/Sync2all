
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
var update_batch = false;

var debug = false;

// doesn't include browser links
var webLinks = [];
var enabledWebLinks = [];
var finishedLinks = [];

