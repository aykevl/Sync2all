'use strict';

function TreeBasedLink (id) {
	Link.call(this, id);
}

TreeBasedLink.prototype.__proto__ = Link.prototype;

TreeBasedLink.prototype._startSync = function () {
	Link.prototype._startSync.call(this);
	// local IDs mapped to own bookmark objects, should be deleted after merging
	this.ids = {};
	this.ids[this.bookmarks.id] = this.bookmarks;
}

