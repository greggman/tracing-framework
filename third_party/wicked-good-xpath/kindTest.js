// Copyright 2012 Google Inc. All Rights Reserved.

/**
 * @fileoverview A class implementing the xpath 1.0 subset of the
 *               KindTest construct.
 */

goog.provide('wgxpath.KindTest');

goog.require('wgxpath.NodeTest');
goog.require('wgxpath.NodeType');



/**
 * Constructs a subset of KindTest based on the xpath grammar:
 * http://www.w3.org/TR/xpath20/#prod-xpath-KindTest
 *
 * @param {string} typeName Type name to be tested.
 * @param {wgxpath.Literal=} opt_literal Optional literal for
 *        processing-instruction nodes.
 * @constructor
 * @implements {wgxpath.NodeTest}
 */
wgxpath.KindTest = function(typeName, opt_literal) {

  /**
   * @type {string}
   * @private
   */
  this.typeName_ = typeName;

  /**
   * @type {wgxpath.Literal}
   * @private
   */
  this.literal_ = goog.isDef(opt_literal) ? opt_literal : null;

  /**
   * @type {?goog.dom.NodeType}
   * @private
   */
  this.type_ = null;
  switch (typeName) {
    // case 'comment':
    //   this.type_ = goog.dom.NodeType.COMMENT;
    //   break;
    case 'node':
      break;
    default:
      throw Error('Unexpected argument');
  }
};


/**
 * Checks if a type name is a valid KindTest parameter.
 *
 * @param {string} typeName The type name to be checked.
 * @return {boolean} Whether the type name is legal.
 */
wgxpath.KindTest.isValidType = function(typeName) {
  return typeName == 'comment' || typeName == 'node';
};


/**
 * @override
 */
wgxpath.KindTest.prototype.matches = function(node) {
  return !this.type_ || this.type_ == node.getNodeType();
};


/**
 * Returns the type of the node.
 *
 * @return {?number} The type of the node, or null if any type.
 */
wgxpath.KindTest.prototype.getType = function() {
  return this.type_;
};


/**
 * @override
 */
wgxpath.KindTest.prototype.getName = function() {
  return this.typeName_;
};


/**
 * @override
 */
wgxpath.KindTest.prototype.toString = function() {
  return this.toStringIndented();
};


/**
 * @override
 */
wgxpath.KindTest.prototype.toStringIndented = function(opt_indent) {
  var indent = opt_indent || '';
  var text = indent + 'kindtest: ' + this.typeName_;
  if (this.literal_) {
    text += '\n' + this.literal_.toStringIndented(indent + wgxpath.Expr.INDENT);
  }
  return text;
};
