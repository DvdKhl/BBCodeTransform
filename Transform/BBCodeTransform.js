///<reference path="ThirdParty/DefinitelyTyped/angularjs/angular.d.ts" />
var BBCode;
(function (BBCode) {
    var Trie = (function () {
        function Trie() {
            this.root = new TrieNode();
        }
        Trie.prototype.add = function (key, value) {
            var current = this.root;
            for (var i = 0; i < key.length; i++) {
                var char = key[i];

                if (!(char in current.nodes)) {
                    var node = new TrieNode();
                    current.nodes[char] = node;
                }
                current = current.nodes[char];
            }
            current.value = value;
        };
        return Trie;
    })();
    var TrieNode = (function () {
        function TrieNode() {
            this.value = null;
            this.nodes = {};
        }
        return TrieNode;
    })();

    var BBCodeTransform = (function () {
        function BBCodeTransform() {
            this.noValueParameterPrefix = "#";
            this.rules = new BBCodeRules();
        }
        BBCodeTransform.prototype.SetPreprocessor = function (preprocessor) {
            this.preprocessor = preprocessor;
        };
        BBCodeTransform.prototype.SetTagDefinitions = function (tagDefinitions) {
            this.tagDefinitions = {};
            for (var i = 0; i < tagDefinitions.length; i++) {
                this.tagDefinitions[tagDefinitions[i].Name] = tagDefinitions[i];
            }
        };
        BBCodeTransform.prototype.SetSubstitutions = function (substitutions) {
            this.substitutions = new Trie();
            for (var i = 0; i < substitutions.length; i++) {
                this.substitutions.add(substitutions[i].match, substitutions[i].replacement);
            }
        };

        BBCodeTransform.prototype.ToHtml = function (source) {
            this.substitutions = this.substitutions || new Trie();
            this.tagDefinitions = this.tagDefinitions || {};

            this.tagStack = [];
            this.position = 0;
            this.source = source;

            if (this.preprocessor)
                this.source = this.preprocessor(this.source);
            this.source = this.source.replace(/\r\n?/g, "\n");

            var items = this.parse();
            this.parseText(this.position, this.source.length, items);

            var elem = document.createElement("div");
            for (var i = 0; i < items.length; i++)
                elem.appendChild(items[i]);
            return elem;
        };

        BBCodeTransform.prototype.parse = function () {
            var items = [];

            var textStartPosition = this.position;
            var backtrackPosition = this.position;
            while (this.position < this.source.length) {
                if (this.source[this.position] == "[") {
                    var textEndPosition = this.position;
                    backtrackPosition = this.position + 1;

                    if (this.source[this.position + 1] == "/") {
                        this.position += 2;
                        backtrackPosition = this.position;

                        //Potential Closing Tag
                        var name = this.parseName();
                        if (this.source[this.position] != "]") {
                            //No closing tag: Backtrack
                            //console.log("No closing tag backtracking to " + backtrackPosition);
                            this.position = backtrackPosition;
                        } else if (this.tagStack.length != 0 && name == this.tagStack[0].Name) {
                            //Is matching closing tag
                            //console.log("Closing tag: " + name);
                            this.parseText(textStartPosition, textEndPosition, items);
                            backtrackPosition = textStartPosition = ++this.position;
                            this.tagStack.shift();
                            break;
                        } else {
                            //Is wrong closing tag: Backtrack
                            //console.log("Wrong closing tag(" + name + ") Backtracking to " + backtrackPosition);
                            this.position = backtrackPosition;
                        }
                    } else if (this.rules.mayParseNewTags) {
                        //Potential Opening tag
                        var tag = this.parseTag();
                        var tagDefinition = tag != null ? this.tagDefinitions[tag.Name] || null : null;

                        if (tagDefinition != null) {
                            //Is opening Tag
                            //console.log("Opening tag: " + tag.Name);
                            this.parseText(textStartPosition, textEndPosition, items);
                            backtrackPosition = textStartPosition = this.position;

                            var oldRules = this.rules.Clone();
                            tagDefinition.OnTag(this.rules);

                            var tagItems;
                            if (!tagDefinition.IsSelfClosing) {
                                this.tagStack.unshift(tagDefinition);
                                tagItems = this.parse();
                            }
                            this.rules = oldRules;

                            var tagElem = tagDefinition.Handle(tag, tagItems || []);

                            if (tagElem != null) {
                                items.push(tagElem);
                                backtrackPosition = textStartPosition = this.position;
                            }
                        } else {
                            //No opening Tag: Backtrack
                            //console.log("No opening tag backtracking to " + backtrackPosition);
                            this.position = backtrackPosition;
                        }
                    } else
                        this.position++;
                } else if (this.rules.mayReplaceNewLinesWithBr && this.source[this.position] == "\n") {
                    this.parseText(textStartPosition, this.position, items);
                    items.push(document.createElement("br"));
                    backtrackPosition = textStartPosition = textEndPosition = ++this.position;
                } else
                    this.position++;
            }

            this.position = textStartPosition; //Reset position when parsing text and reaching end of string instead of end of tag
            return items;
        };
        BBCodeTransform.prototype.parseTag = function () {
            var tag = new BBCodeTag();

            if (this.source[this.position] != "[")
                throw new Error("Internal BBCodeTransform.parseTag error: Tag didn't start with [");
            this.position++, tag.Name = this.parseName();
            if (tag.Name == null)
                return null;

            if (this.source[this.position] == "=") {
                this.position++;
                tag.Value = this.parseValue();
                if (tag.Value == null)
                    return null;
            }

            while (this.source[this.position] == " ") {
                this.position++;
                if (this.source[this.position] == this.noValueParameterPrefix) {
                    this.position++;
                    var name = this.parseName();
                    tag.Attributes[name] = null;
                } else {
                    var name = this.parseName();
                    if (this.source[this.position++] != "=")
                        return null;
                    var value = this.parseValue();
                    tag.Attributes[name] = value;
                }
            }

            if (this.source[this.position] != "]")
                return null;
            this.position++;

            return tag;
        };
        BBCodeTransform.prototype.parseName = function () {
            var oldPosition = this.position;

            var charCode = this.source.charCodeAt(this.position);
            while ((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)) {
                charCode = this.source.charCodeAt(++this.position);
            }

            return this.source.substring(oldPosition, this.position);
        };
        BBCodeTransform.prototype.parseValue = function () {
            var oldPosition = this.position;

            var charCode = this.source.charCodeAt(this.position);
            while (++this.position < this.source.length && charCode != 32 && charCode != 93) {
                charCode = this.source.charCodeAt(this.position);
            }

            return this.source.substring(oldPosition, --this.position);
        };
        BBCodeTransform.prototype.parseText = function (start, length, items) {
            if (!this.rules.maySubstitute) {
                items.push(document.createTextNode(this.source.substring(start, length)));
                return;
            }

            var position = start;
            var end = start;

            var node = this.substitutions.root;
            var prevNode = this.substitutions.root;
            while (position < length + 1) {
                node = node.nodes[this.source[position]] || null;

                if (!node) {
                    if (prevNode && prevNode.value) {
                        items.push(document.createTextNode(this.source.substring(start, end)));
                        start = position;

                        var elem = prevNode.value();
                        items.push(elem);
                    }

                    end = position;
                    node = this.substitutions.root.nodes[this.source[position]];
                    if (!node) {
                        end++;
                        node = this.substitutions.root;
                    }
                }

                prevNode = node;
                position++;
            }
            if (start != length)
                items.push(document.createTextNode(this.source.substring(start, length)));
        };
        return BBCodeTransform;
    })();
    BBCode.BBCodeTransform = BBCodeTransform;
    var BBCodeTag = (function () {
        function BBCodeTag() {
            this.Attributes = {};
        }
        return BBCodeTag;
    })();
    BBCode.BBCodeTag = BBCodeTag;
    var BBCodeRules = (function () {
        function BBCodeRules() {
            this.maySubstitute = true;
            this.mayParseNewTags = true;
            this.mayReplaceNewLinesWithBr = true;
        }
        BBCodeRules.prototype.Clone = function () {
            var rules = new BBCodeRules();
            rules.maySubstitute = this.maySubstitute;
            rules.mayParseNewTags = this.mayParseNewTags;
            rules.mayReplaceNewLinesWithBr = this.mayReplaceNewLinesWithBr;
            return rules;
        };
        return BBCodeRules;
    })();
    BBCode.BBCodeRules = BBCodeRules;

    var BBCodeTagDefinition = (function () {
        function BBCodeTagDefinition(name, isSelfClosing, handle, onTag) {
            this.name = name;
            this.isSelfClosing = isSelfClosing;
            this.handle = handle;
            this.onTag = onTag || null;
        }
        Object.defineProperty(BBCodeTagDefinition.prototype, "Name", {
            get: function () {
                return this.name;
            },
            enumerable: true,
            configurable: true
        });
        Object.defineProperty(BBCodeTagDefinition.prototype, "IsSelfClosing", {
            get: function () {
                return this.isSelfClosing;
            },
            enumerable: true,
            configurable: true
        });

        BBCodeTagDefinition.prototype.OnTag = function (rules) {
            if (this.onTag)
                this.onTag(rules);
        };

        BBCodeTagDefinition.prototype.Handle = function (tag, items) {
            return this.handle(tag, items);
        };
        BBCodeTagDefinition.Decline = {};
        return BBCodeTagDefinition;
    })();
    BBCode.BBCodeTagDefinition = BBCodeTagDefinition;
    var BBCodeTags = (function () {
        function BBCodeTags() {
        }
        BBCodeTags.Pre = new BBCode.BBCodeTagDefinition("pre", false, function (tag, items) {
            //console.log(items);
            var elem = document.createElement("pre");
            for (var i = 0; i < items.length; i++)
                elem.appendChild(items[i]);
            return elem;
        }, function (rules) {
            rules.maySubstitute = rules.mayParseNewTags = rules.mayReplaceNewLinesWithBr = false;
        });

        BBCodeTags.B = new BBCode.BBCodeTagDefinition("b", false, function (tag, items) {
            //console.log(items);
            var elem = document.createElement("b");
            for (var i = 0; i < items.length; i++)
                elem.appendChild(items[i]);
            return elem;
        });
        BBCodeTags.I = new BBCode.BBCodeTagDefinition("i", false, function (tag, items) {
            //console.log(items);
            var elem = document.createElement("i");
            for (var i = 0; i < items.length; i++)
                elem.appendChild(items[i]);
            return elem;
        });
        BBCodeTags.U = new BBCode.BBCodeTagDefinition("u", false, function (tag, items) {
            //console.log(items);
            var elem = document.createElement("span");
            elem.style.textDecoration = "underline";

            for (var i = 0; i < items.length; i++)
                elem.appendChild(items[i]);
            return elem;
        });
        BBCodeTags.S = new BBCode.BBCodeTagDefinition("s", false, function (tag, items) {
            //console.log(items);
            var elem = document.createElement("span");
            elem.style.textDecoration = "line-through";

            for (var i = 0; i < items.length; i++)
                elem.appendChild(items[i]);
            return elem;
        });
        BBCodeTags.Url = new BBCode.BBCodeTagDefinition("url", false, function (tag, items) {
            //console.log(items);
            var elem = document.createElement("a");
            elem.href = tag.Value;

            var title = tag.Attributes["title"];
            if (title)
                elem.title = title;

            for (var i = 0; i < items.length; i++)
                elem.appendChild(items[i]);
            return elem;
        });
        BBCodeTags.Spoiler = new BBCode.BBCodeTagDefinition("spoiler", false, function (tag, items) {
            //console.log(items);
            var spanElem = document.createElement("span");
            spanElem.classList.add("spoiler");
            spanElem.classList.add("hide");
            for (var i = 0; i < items.length; i++)
                spanElem.appendChild(items[i]);

            var inputElem = document.createElement("input");
            inputElem.classList.add("button");
            inputElem.type = "button";
            inputElem.value = "Show Spoiler";
            inputElem.onclick = function () {
                inputElem.value = spanElem.classList.toggle("hide") ? "Show Spoiler" : "Hide Spoiler";
            };

            var containerElem = document.createElement("div");
            containerElem.classList.add("spoiler");
            containerElem.appendChild(spanElem);
            containerElem.appendChild(inputElem);

            return containerElem;
        });
        BBCodeTags.Img = new BBCode.BBCodeTagDefinition("img", true, function (tag, items) {
            //console.log(items);
            var imgElem = document.createElement("img");
            imgElem.src = tag.Value;

            var title = tag.Attributes["title"];
            if (title)
                imgElem.title = title;

            var width = tag.Attributes["width"];
            if (width)
                imgElem.width = parseInt(width);

            var height = tag.Attributes["height"];
            if (height)
                imgElem.width = parseInt(height);

            var containerElem = document.createElement("div");
            containerElem.appendChild(imgElem);

            var overlayElem;

            imgElem.onclick = function () {
                if (overlayElem) {
                    containerElem.removeChild(overlayElem);
                    overlayElem = null;
                } else {
                    var overlayImageElem = document.createElement("img");
                    overlayImageElem.src = tag.Value;
                    overlayElem = document.createElement("div");
                    overlayElem.appendChild(overlayImageElem);
                    overlayElem.classList.add("image-overlay");
                    containerElem.appendChild(overlayElem);
                    overlayElem.onclick = imgElem.onclick;
                }
            };

            return containerElem;
        });
        return BBCodeTags;
    })();
    BBCode.BBCodeTags = BBCodeTags;

    function Register(angular) {
        if (!angular)
            return;

        var bbCodeModule = angular.module("bbCode", []);

        bbCodeModule.directive('bbcodeDocument', function () {
            return {
                restrict: 'E',
                replace: true,
                scope: { source: "=", transform: "=", debug: "=" },
                link: function ($scope, element, attr) {
                    var unregister = $scope.$watch('source', function (newValue) {
                        element.empty();
                        if (!$scope.transform)
                            return;

                        $scope.source = $scope.source || "";

                        var start = window.performance.now();
                        var bbcodeElem = $scope.transform.ToHtml($scope.source);
                        var elapsed = window.performance.now() - start;

                        element.append(bbcodeElem);
                        if ($scope.debug == true)
                            element.append("<br>Elapsed: " + elapsed + "ms");
                    });
                }
            };
        });
    }
    BBCode.Register = Register;
})(BBCode || (BBCode = {}));

BBCode.Register(angular);
//# sourceMappingURL=BBCodeTransform.js.map
