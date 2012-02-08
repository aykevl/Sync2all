'use strict';

function TreeBasedLink (id) {
	Link.call(this, id);

	/* Added/changed lists
	 * A node is always in one of the two, not in both. (and, when nothing happened, in none)
	 * TODO something's wrong here
	 * How should we index items that have been added by another link?
	 */
	// index of node.*_id => (node)
	this.changed = {};
}

TreeBasedLink.prototype.__proto__ = Link.prototype;

TreeBasedLink.prototype._startSync = function () {
	Link.prototype._startSync.call(this);
	// local IDs mapped to own bookmark objects, should be deleted after merging
	this.ids = this.bookmarks.ids;
}

TreeBasedLink.prototype.commit = function () {
	if (debug) {
		console.log(this.fullName+' commit');
	}
	for (var id in this.changed) {
		var node = this.changed[id];
		this.queue_add(this.changeItem.bind(this), node);
	}
	this.changed = {};
	this.queue_start(); // start running
}

TreeBasedLink.prototype.bm_del =
TreeBasedLink.prototype.f_del  = function (link, node) {
	delete this.changed[node[this.id+'_id']]; // remove when needed
	this.queue_add(this.removeItem.bind(this), node[this.id+'_id']);
}

TreeBasedLink.prototype.f_mod_title  =
TreeBasedLink.prototype.bm_mod_title =
TreeBasedLink.prototype.bm_mod_url   = function (link, node) {
	var id = node[this.id+'_id'];
	if (!id) {
		console.error(this.id+': no *_id while changing', node);
	} else {
		this.changed[id] = node;
	}
}


TreeBasedLink.prototype.bm_mv =
TreeBasedLink.prototype. f_mv = function (link, node, oldParent) {
	this.queue_add(this.moveItem.bind(this), node);
};

TreeBasedLink.prototype.bm_add =
TreeBasedLink.prototype. f_add = function (link, node) {
	console.warn('*_add', this.id, node);
	this.queue_add(function (node, callback) {
			if (node[this.id+'_id']) {
				this.queue_error(node, 'already uploaded');
			} else if (node.parentNode != sync2all.bookmarks &&
				!node.parentNode[this.id+'_id']) {
				this.queue_error(node, 'no parent ID while uploading node');
			} else {
				this.createItem(node, callback);
			}
		}.bind(this), node);
}

