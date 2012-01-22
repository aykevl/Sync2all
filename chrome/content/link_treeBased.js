'use strict';

function TreeBasedLink (id) {
	Link.call(this, id);
	this.added   = {};
	this.changed = {};
}

TreeBasedLink.prototype.__proto__ = Link.prototype;

TreeBasedLink.prototype._startSync = function () {
	Link.prototype._startSync.call(this);
	// local IDs mapped to own bookmark objects, should be deleted after merging
	this.ids = {};
	this.ids[this.bookmarks.id] = this.bookmarks;
}

TreeBasedLink.prototype.commit = function () {
	if (debug) {
		console.log(this.fullName+' commit');
	}
	for (var id in this.changed) {
		var node = this.changed[id];
		if (!node) {
			this.queue_add(this.removeItem.bind(this), id);
		} else {
			this.queue_add(this.changeItem.bind(this), node);
		}
	}
	this.changed = {};
	this.queue_start(); // start running
}

TreeBasedLink.prototype.bm_del =
TreeBasedLink.prototype.f_del  = function (link, node) {
	var id = node[this.id+'_id'];
	if (!id) {
		console.error(this.id+': no *_id while deleting', node);
		return;
	}
	this.changed[id] = false;
}

TreeBasedLink.prototype.f_mod_title  =
TreeBasedLink.prototype.bm_mod_title =
TreeBasedLink.prototype.bm_mod_url   = function (link, node) {
	var id = node[this.id+'_id'];
	if (!id) {
		// if this node will be uploaded anyway
		if (!this.added[node.id]) {
			console.error(this.id+': no *_id while deleting', node);
		}
	} else {
		this.changed[id] = node;
	}
}

