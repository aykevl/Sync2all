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

var debug = false;
if (localStorage.debug) {
	debug = JSON.parse(localStorage.debug);
}

var webLinks = [];

var tagStructuredWebLinks = [];

var sync2all;

