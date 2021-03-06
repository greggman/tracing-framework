/**
 * Copyright 2013 Google, Inc. All Rights Reserved.
 *
 * Use of this source code is governed by a BSD-style license that can be
 * found in the LICENSE file.
 */

/**
 * @fileoverview Event iterator.
 *
 * @author benvanik@google.com (Ben Vanik)
 */

goog.provide('wtf.db.EventIterator');

goog.require('wtf.db.EventStruct');
goog.require('wtf.db.Unit');
goog.require('wtf.util');



/**
 * Event iterator.
 * Used for iterating over and accessing event data.
 *
 * @param {!wtf.db.EventList} eventList Data scope.
 * @param {number} firstIndex Start of the iterator.
 * @param {number} lastIndex End of the iterator.
 * @param {number} index Current position of the iterator.
 * @param {Array.<number>=} opt_indirectionTable Indirection table.
 * @constructor
 */
wtf.db.EventIterator = function(eventList, firstIndex, lastIndex, index,
    opt_indirectionTable) {
  /**
   * Data scope.
   * @type {!wtf.db.EventList}
   * @private
   */
  this.eventList_ = eventList;

  /**
   * First allowed index in the event data store.
   * @type {number}
   * @private
   */
  this.firstIndex_ = firstIndex;

  /**
   * Last allowed index in the event data store.
   * @type {number}
   * @private
   */
  this.lastIndex_ = lastIndex;

  /**
   * Current index into the event data store.
   * @type {number}
   * @private
   */
  this.index_ = index;

  /**
   * Indirection table used to translate the current index of the iterator
   * into event offsets in the data store.
   * If this is not defined then a simple [0-n] mapping is used.
   * @type {Array.<number>}
   * @private
   */
  this.indirectionTable_ = opt_indirectionTable || null;

  /**
   * Event data structure.
   * @type {!Uint32Array}
   * @private
   */
  this.eventData_ = eventList.eventData;

  /**
   * Offset into the data array.
   * This is stored as /4.
   * @type {number}
   * @private
   */
  this.offset_ = -1;

  /**
   * A cached iterator used for fast mode {@see #getParent}.
   * Initialized on demand.
   * @type {wtf.db.EventIterator}
   * @private
   */
  this.cachedParentIt_ = null;

  this.seek(this.index_);
};


/**
 * Gets the number of items that can be iterated.
 * @return {number} Count.
 */
wtf.db.EventIterator.prototype.getCount = function() {
  return this.lastIndex_ - this.firstIndex_ + 1;
};


/**
 * Moves to a specific event, relative to the iterator range.
 * @param {number} index Index.
 */
wtf.db.EventIterator.prototype.seek = function(index) {
  if (index < 0) {
    this.index_ = this.lastIndex_ + 1;
    return;
  }
  this.index_ = index;
  if (this.index_ > this.lastIndex_) {
    return;
  }
  var i = this.indirectionTable_ ?
      this.indirectionTable_[this.index_] : this.index_;
  this.offset_ = i * wtf.db.EventStruct.STRUCT_SIZE;
};


/**
 * Moves to the next event.
 */
wtf.db.EventIterator.prototype.next = function() {
  ++this.index_;
  var i = this.indirectionTable_ ?
      this.indirectionTable_[this.index_] : this.index_;
  this.offset_ = i * wtf.db.EventStruct.STRUCT_SIZE;
};


/**
 * Moves to the next scope event.
 */
wtf.db.EventIterator.prototype.nextScope = function() {
  // This is inlined because painters use it.
  var eventData = this.eventData_;
  var i = this.index_;
  var o = this.offset_;
  while (i <= this.lastIndex_) {
    i++;
    o += wtf.db.EventStruct.STRUCT_SIZE;
    if (eventData[o + wtf.db.EventStruct.END_TIME]) {
      break;
    }
  }
  this.index_ = i;
  this.offset_ = o;
};


/**
 * Moves to the next instance event.
 */
wtf.db.EventIterator.prototype.nextInstance = function() {
  // This is inlined because painters use it.
  var eventData = this.eventData_;
  var i = this.index_;
  var o = this.offset_;
  while (i <= this.lastIndex_) {
    i++;
    o += wtf.db.EventStruct.STRUCT_SIZE;
    if (!eventData[o + wtf.db.EventStruct.END_TIME]) {
      break;
    }
  }
  this.index_ = i;
  this.offset_ = o;
};


/**
 * Moves the iterator to the next sibling event, skipping all descendants.
 */
wtf.db.EventIterator.prototype.nextSibling = function() {
  var nextId = this.eventData_[this.offset_ + wtf.db.EventStruct.NEXT_SIBLING];
  if (!nextId) {
    nextId = this.lastIndex_ + 1;
  }
  this.seek(nextId);
};


/**
 * Moves the iterator to the next sibling scope, skipping all descendants.
 */
wtf.db.EventIterator.prototype.nextSiblingScope = function() {
  // Find th enext sibling ID and seek to it.
  // Note that it may be zero, in which case we just end.
  var eventData = this.eventData_;
  var nextId = eventData[this.offset_ + wtf.db.EventStruct.NEXT_SIBLING];
  if (!nextId) {
    nextId = this.lastIndex_ + 1;
  }
  this.seek(nextId);

  // The next sibling may not be a scope - if we haven't run off the end see if
  // it isn't and move until we find it.
  if (this.index_ <= this.lastIndex_ &&
      !eventData[this.offset_ + wtf.db.EventStruct.END_TIME]) {
    this.nextScope();
  }
};


/**
 * Moves to the first scope event in the iterator.
 * If there are no scope events this is set to done.
 */
wtf.db.EventIterator.prototype.moveToFirstScope = function() {
  this.seek(this.firstIndex_);
  if (this.index_ <= this.lastIndex_) {
    if (!this.isScope()) {
      this.nextScope();
    }
  }
};


/**
 * Moves to the first instance event in the iterator.
 * If there are no instance events this is set to done.
 */
wtf.db.EventIterator.prototype.moveToFirstInstance = function() {
  this.seek(this.firstIndex_);
  if (this.index_ <= this.lastIndex_) {
    if (!this.isInstance()) {
      this.nextInstance();
    }
  }
};


/**
 * Moves to the parent of the current event.
 */
wtf.db.EventIterator.prototype.moveToParent = function() {
  var parentIndex = this.eventData_[this.offset_ + wtf.db.EventStruct.PARENT];
  if (parentIndex >= 0) {
    this.seek(parentIndex);
  } else {
    // No parent, move to end.
    this.seek(this.lastIndex_ + 1);
  }
};


/**
 * Whether the iterator is at the end.
 * @return {boolean} True if the iterator is at the end/empty.
 */
wtf.db.EventIterator.prototype.done = function() {
  return this.index_ > this.lastIndex_;
};


/**
 * Gets the unique ID of the current event.
 * @return {number} Event ID.
 */
wtf.db.EventIterator.prototype.getId = function() {
  return this.eventData_[this.offset_ + wtf.db.EventStruct.ID];
};


/**
 * Gets the type ID of the current event.
 * @return {number} Type ID.
 */
wtf.db.EventIterator.prototype.getTypeId = function() {
  return this.eventData_[this.offset_ + wtf.db.EventStruct.TYPE] & 0xFFFF;
};


/**
 * Gets the type of the current event.
 * @return {!wtf.db.EventType} Event type.
 */
wtf.db.EventIterator.prototype.getType = function() {
  // TODO(benvanik): cache until move
  var typeId = this.eventData_[this.offset_ + wtf.db.EventStruct.TYPE] & 0xFFFF;
  return /** @type {!wtf.db.EventType} */ (
      this.eventList_.eventTypeTable.getById(typeId));
};


/**
 * Gets the name the current event.
 * @return {string} Event name.
 */
wtf.db.EventIterator.prototype.getName = function() {
  var type = this.getType();
  return type.getName();
};


/**
 * Gets the event type flags.
 * @return {number} A bitmask of {@see wtf.data.EventFlag}.
 */
wtf.db.EventIterator.prototype.getTypeFlags = function() {
  return this.eventData_[this.offset_ + wtf.db.EventStruct.TYPE] >>> 16;
};


/**
 * Whether the current event is a scope type.
 * @return {boolean} True if the event is a scope event type.
 */
wtf.db.EventIterator.prototype.isScope = function() {
  return !!this.eventData_[this.offset_ + wtf.db.EventStruct.END_TIME];
};


/**
 * Whether the current event is an instance type.
 * @return {boolean} True if the event is an instance event type.
 */
wtf.db.EventIterator.prototype.isInstance = function() {
  return !this.eventData_[this.offset_ + wtf.db.EventStruct.END_TIME];
};


/**
 * Gets the parent of the current event, unless it is the root.
 * @param {boolean=} opt_fast True to use a cached iterator. This prevents an
 *     allocation and greatly speeds up the operation if the iterator will not
 *     be retained by the caller.
 * @return {wtf.db.EventIterator} Parent scope, if any.
 */
wtf.db.EventIterator.prototype.getParent = function(opt_fast) {
  var parentIndex = this.eventData_[this.offset_ + wtf.db.EventStruct.PARENT];
  if (parentIndex >= 0) {
    if (opt_fast) {
      var it = this.cachedParentIt_;
      if (!it) {
        it = this.cachedParentIt_ = new wtf.db.EventIterator(
            this.eventList_, 0, this.eventList_.count, parentIndex);
      } else {
        it.seek(parentIndex);
      }
      return it;
    } else {
      return new wtf.db.EventIterator(
          this.eventList_,
          0, this.eventList_.count,
          parentIndex);
    }
  }
  return null;
};


/**
 * Gets the end time of the parent scope, or zero if this event is in the root.
 * @return {number} End time of the parent or zero.
 */
wtf.db.EventIterator.prototype.getParentEndTime = function() {
  var parentIndex = this.eventData_[this.offset_ + wtf.db.EventStruct.PARENT];
  if (parentIndex >= 0) {
    var parentOffset = parentIndex * wtf.db.EventStruct.STRUCT_SIZE;
    return this.eventData_[parentOffset + wtf.db.EventStruct.END_TIME];
  }
  return 0;
};


/**
 * Gets the depth (distance from root) of the current event.
 * @return {number} Scope depth.
 */
wtf.db.EventIterator.prototype.getDepth = function() {
  return this.eventData_[this.offset_ + wtf.db.EventStruct.DEPTH] & 0xFFFF;
};


/**
 * Gets the maximum depth (distance from root) of an descendant of this
 * event.
 * @return {number} Scope depth.
 */
wtf.db.EventIterator.prototype.getMaxDescendantDepth = function() {
  return this.eventData_[this.offset_ + wtf.db.EventStruct.DEPTH] >>> 16;
};


/**
 * Gets the time of the current event.
 * If this is a scope event the time indicates the time of entry.
 * @return {number} Event time.
 */
wtf.db.EventIterator.prototype.getTime = function() {
  return this.eventData_[this.offset_ + wtf.db.EventStruct.TIME] / 1000;
};


/**
 * Gets the argument data for the current event, if any.
 * @return {wtf.db.ArgumentData} Argument data, if any.
 */
wtf.db.EventIterator.prototype.getArguments = function() {
  var argsId = this.eventData_[this.offset_ + wtf.db.EventStruct.ARGUMENTS];
  return argsId ? this.eventList_.getArgumentData(argsId) : null;
};


/**
 * Gets the argument value from the current event with the given key.
 * @param {string} key Argument key.
 * @return {*} Argument value or undefined if not found.
 */
wtf.db.EventIterator.prototype.getArgument = function(key) {
  // TODO(benvanik): cache until move
  var args = this.getArguments();
  return args ? args.get(key) : undefined;
};


// wtf.db.EventIterator.prototype.getFlow = function() {
//   var valueId = this.eventData_[this.offset_ + wtf.db.EventStruct.VALUE];
//   return null;
// };


/**
 * Gets the application-defined event tag for the current event, if any.
 * @return {number} Event tag.
 */
wtf.db.EventIterator.prototype.getTag = function() {
  return this.eventData_[this.offset_ + wtf.db.EventStruct.TAG];
};


/**
 * Sets the application-defined event tag for the current event, if any.
 * @param {number} value Event tag.
 */
wtf.db.EventIterator.prototype.setTag = function(value) {
  this.eventData_[this.offset_ + wtf.db.EventStruct.TAG] = value;
};


/**
 * Gets the time the current scope ended.
 * Only valid for scope events.
 * @return {number} Scope end time.
 */
wtf.db.EventIterator.prototype.getEndTime = function() {
  return this.eventData_[this.offset_ + wtf.db.EventStruct.END_TIME] / 1000;
};


/**
 * Gets the duration of the current scope.
 * This may exclude tracing time.
 * Only valid for scope events.
 * @return {number} Total duration of the scope including system time.
 */
wtf.db.EventIterator.prototype.getTotalDuration = function() {
  var eventData = this.eventData_;
  var o = this.offset_;
  return (eventData[o + wtf.db.EventStruct.END_TIME] -
      eventData[o + wtf.db.EventStruct.TIME]) / 1000;
};


/**
 * Gets the duration of the current scope minus system time.
 * Only valid for scope events.
 * @return {number} Total duration of the scope excluding system time.
 */
wtf.db.EventIterator.prototype.getUserDuration = function() {
  var eventData = this.eventData_;
  var o = this.offset_;
  var total =
      eventData[o + wtf.db.EventStruct.END_TIME] -
      eventData[o + wtf.db.EventStruct.TIME];
  return (total - eventData[o + wtf.db.EventStruct.SYSTEM_TIME]) / 1000;
};


/**
 * Gets the duration of the current scope minus its children and system time.
 * Only valid for scope events.
 * @return {number} Total duration of the scope excluding children.
 */
wtf.db.EventIterator.prototype.getOwnDuration = function() {
  var eventData = this.eventData_;
  var o = this.offset_;
  var total =
      eventData[o + wtf.db.EventStruct.END_TIME] -
      eventData[o + wtf.db.EventStruct.TIME];
  return (total - eventData[o + wtf.db.EventStruct.CHILD_TIME]) / 1000;
};


/**
 * Gets an informative string about the current event.
 * @param {wtf.db.Unit=} opt_units Units to display times in.
 * @return {string?} Info string.
 */
wtf.db.EventIterator.prototype.getInfoString = function(opt_units) {
  if (this.done()) {
    return null;
  }
  var units = goog.isDef(opt_units) ? opt_units : wtf.db.Unit.TIME_MILLISECONDS;
  if (this.isScope()) {
    return this.getScopeInfoString_(units);
  } else if (this.isInstance()) {
    return this.getInstanceInfoString_(units);
  }
  return null;
};


/**
 * Gets an informative string about the current scope event.
 * @param {wtf.db.Unit} units Units to display times in.
 * @return {string} Info string.
 * @private
 */
wtf.db.EventIterator.prototype.getScopeInfoString_ = function(units) {
  var totalTime = wtf.db.Unit.format(this.getTotalDuration(), units);
  var times = totalTime;
  if (this.getTotalDuration() - this.getOwnDuration()) {
    var ownTime = wtf.db.Unit.format(this.getOwnDuration(), units);
    times += ' (' + ownTime + ')';
  }

  var type = this.getType();
  var lines = [
    times + ': ' + type.name
  ];

  var args = this.getArguments();
  if (args) {
    wtf.util.addArgumentLines(lines, args.toObject());
  }

  return lines.join('\n');
};


/**
 * Gets an informative string about the current instance event.
 * @param {wtf.db.Unit} units Units to display times in.
 * @return {string} Info string.
 * @private
 */
wtf.db.EventIterator.prototype.getInstanceInfoString_ = function(units) {
  var lines = [];

  var type = this.getType();
  lines.push(type.name);

  var args = this.getArguments();
  if (args) {
    wtf.util.addArgumentLines(lines, args.toObject());
  }

  return lines.join('\n');
};


goog.exportSymbol(
    'wtf.db.EventIterator',
    wtf.db.EventIterator);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getCount',
    wtf.db.EventIterator.prototype.getCount);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'seek',
    wtf.db.EventIterator.prototype.seek);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'next',
    wtf.db.EventIterator.prototype.next);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'nextScope',
    wtf.db.EventIterator.prototype.nextScope);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'nextInstance',
    wtf.db.EventIterator.prototype.nextInstance);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'nextSibling',
    wtf.db.EventIterator.prototype.nextSibling);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'moveToParent',
    wtf.db.EventIterator.prototype.moveToParent);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'done',
    wtf.db.EventIterator.prototype.done);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getId',
    wtf.db.EventIterator.prototype.getId);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getTypeId',
    wtf.db.EventIterator.prototype.getTypeId);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getType',
    wtf.db.EventIterator.prototype.getType);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getName',
    wtf.db.EventIterator.prototype.getName);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getTypeFlags',
    wtf.db.EventIterator.prototype.getTypeFlags);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'isScope',
    wtf.db.EventIterator.prototype.isScope);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'isInstance',
    wtf.db.EventIterator.prototype.isInstance);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getParent',
    wtf.db.EventIterator.prototype.getParent);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getDepth',
    wtf.db.EventIterator.prototype.getDepth);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getTime',
    wtf.db.EventIterator.prototype.getTime);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getArguments',
    wtf.db.EventIterator.prototype.getArguments);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getArgument',
    wtf.db.EventIterator.prototype.getArgument);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getTag',
    wtf.db.EventIterator.prototype.getTag);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'setTag',
    wtf.db.EventIterator.prototype.setTag);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getEndTime',
    wtf.db.EventIterator.prototype.getEndTime);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getTotalDuration',
    wtf.db.EventIterator.prototype.getTotalDuration);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getUserDuration',
    wtf.db.EventIterator.prototype.getUserDuration);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getOwnDuration',
    wtf.db.EventIterator.prototype.getOwnDuration);
goog.exportProperty(
    wtf.db.EventIterator.prototype, 'getInfoString',
    wtf.db.EventIterator.prototype.getInfoString);
