'use strict';

var statuses = {
	READY:       0,
	AUTHORIZING: 1,
	DOWNLOADING: 2,
	PARSING:     3,
	MERGING:     4,
	UPLOADING:   5,
}

var browser;

var debug = true;

// webLinks doesn't include browser links (obvious)
var webLinks = [];
var enabledWebLinks = [];
var tagStructuredWebLinks = [];

