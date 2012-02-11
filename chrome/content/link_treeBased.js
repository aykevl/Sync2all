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
		if (node.deleted) {
			// removed
			this.queue_add(function (node, callback) {
					if (!node.getId(this)) {
						this.queue_error(node, 'no id while removing');
						return;
					}
					if (node.rootNode.ids[node.id]) {
						this.queue_error(node, 'Not removed from rootNode');
						return;
					}
					this.removeItem(node, callback);
				}.bind(this), node);
		} else {
			// changed
			if (!node.isDeleted(this)) // whether node/parent/grandparent/etc is deleted
				this.queue_add(this.changeItem.bind(this), node);
		}
	}
	this.changed = {};
	this.queue_start(); // start running
}

TreeBasedLink.prototype.bm_del =
TreeBasedLink.prototype.f_del  = function (link, node) {
	this.changed[node.getId(this)] = node;
}

TreeBasedLink.prototype.f_mod_title  =
TreeBasedLink.prototype.bm_mod_title =
TreeBasedLink.prototype.bm_mod_url   = function (link, node) {
	if (!node.getId(this)) {
		console.error(this.id+': no *_id while changing', node);
	} else {
		this.changed[node.getId(this)] = node;
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
			if (node.getId(this)) {
				this.queue_error(node, 'already uploaded');
			} else if (node.parentNode != sync2all.bookmarks &&
				!node.parentNode.getId(this)) {
				this.queue_error(node, 'no parent ID while uploading node');
			} else {
				this.createItem(node, callback);
			}
		}.bind(this), node);
}

