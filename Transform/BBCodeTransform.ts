﻿///<reference path="ThirdParty/DefinitelyTyped/angularjs/angular.d.ts" />

module BBCode {
    class Trie<T> {
        public root: TrieNode<T> = new TrieNode<T>();


        public add(key: string, value: T) {
            var current = this.root;
            for(var i = 0; i < key.length; i++) {
                var char = key[i];

                if(!(char in current.nodes)) {
                    var node = new TrieNode<T>();
                    current.nodes[char] = node;
                }
                current = current.nodes[char];
            }
            current.value = value;
        }
    }
    class TrieNode<T> {
        public value: T = null;
        public nodes: { [char: string]: TrieNode<T> } = {};
    }

    export class BBCodeTransform {
        private substitutions: Trie<() => any>;
        private preprocessor: (source: string) => string;
        private tagDefinitions: { [name: string]: BBCodeTagDefinition }
        private noValueParameterPrefix: string = "#";

        private source: string;
        private position: number;
        private tagStack: BBCodeTagDefinition[];

        private rules = new BBCodeRules();

        public SetPreprocessor(preprocessor: (source: string) => string) { this.preprocessor = preprocessor; }
        public SetTagDefinitions(tagDefinitions: BBCodeTagDefinition[]) {
            this.tagDefinitions = {};
            for(var i = 0; i < tagDefinitions.length; i++) {
                this.tagDefinitions[tagDefinitions[i].Name] = tagDefinitions[i];
            }
        }
        public SetSubstitutions(substitutions: { match: string; replacement: () => any }[]) {
            this.substitutions = new Trie<() => any>();
            for(var i = 0; i < substitutions.length; i++) {
                this.substitutions.add(substitutions[i].match, substitutions[i].replacement);
            }
        }

        public ToHtml(source: string) {
            this.substitutions = this.substitutions || new Trie<() => any>();
            this.tagDefinitions = this.tagDefinitions || {};

            this.tagStack = [];
            this.position = 0;
            this.source = source;

            if(this.preprocessor) this.source = this.preprocessor(this.source);

            var items = this.parse();
            this.parseText(this.position, this.source.length, items);

            var elem = document.createElement("div");
            for(var i = 0; i < items.length; i++) elem.appendChild(items[i]);
            return elem;
        }

        private parse(): any[] {
            var items = [];

            var textStartPosition = this.position;
            var backtrackPosition = this.position;
            while(this.position < this.source.length) {
                if(this.source[this.position] == "[") {
                    var textEndPosition = this.position;
                    backtrackPosition = this.position + 1;

                    if(this.source[this.position + 1] == "/") {
                        this.position += 2;
                        backtrackPosition = this.position;

                        //Potential Closing Tag
                        var name = this.parseName();
                        if(this.source[this.position] != "]") {
                            //No closing tag: Backtrack
                            //console.log("No closing tag backtracking to " + backtrackPosition);
                            this.position = backtrackPosition;

                        } else if(this.tagStack.length != 0 && name == this.tagStack[0].Name) {
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

                    } else if(this.rules.mayParseNewTags) {
                        //Potential Opening tag
                        var tag = this.parseTag();
                        var tagDefinition = tag != null ? this.tagDefinitions[tag.Name] || null : null;

                        if(tagDefinition != null) {
                            //Is opening Tag
                            //console.log("Opening tag: " + tag.Name);
                            this.parseText(textStartPosition, textEndPosition, items);
                            backtrackPosition = textStartPosition = this.position;

                            var oldRules: BBCodeRules = this.rules.Clone();
                            tagDefinition.OnTag(this.rules);

                            var tagItems: any[];
                            if(!tagDefinition.IsSelfClosing) {
                                this.tagStack.unshift(tagDefinition);
                                tagItems = this.parse();
                            }
                            this.rules = oldRules;

                            var tagElem = tagDefinition.Handle(tag, tagItems || []);

                            if(tagElem != null) {
                                items.push(tagElem);
                                backtrackPosition = textStartPosition = this.position;
                            }

                        } else {
                            //No opening Tag: Backtrack
                            //console.log("No opening tag backtracking to " + backtrackPosition);
                            this.position = backtrackPosition;
                        }
                    } else this.position++;

                } else if(this.rules.mayReplaceNewLinesWithBr && this.source[this.position] == "\n") {
                    this.parseText(textStartPosition, this.position, items);
                    items.push(document.createElement("br"));
                    backtrackPosition = textStartPosition = textEndPosition = ++this.position;

                } else this.position++;
            }

            this.position = textStartPosition; //Reset position when parsing text and reaching end of string instead of end of tag
            return items;
        }
        private parseTag(): BBCodeTag {
            var tag = new BBCodeTag();

            if(this.source[this.position] != "[") throw new Error("Internal BBCodeTransform.parseTag error: Tag didn't start with [");
            this.position++,

            tag.Name = this.parseName();
            if(tag.Name == null) return null;

            if(this.source[this.position] == "=") {
                this.position++;
                tag.Value = this.parseValue();
                if(tag.Value == null) return null;
            }

            while(this.source[this.position] == " ") {
                this.position++;
                if(this.source[this.position] == this.noValueParameterPrefix) {
                    this.position++;
                    var name = this.parseName();
                    tag.Attributes[name] = null;

                } else {
                    var name = this.parseName();
                    if(this.source[this.position++] != "=") return null;
                    var value = this.parseValue();
                    tag.Attributes[name] = value;
                }
            }

            if(this.source[this.position] != "]") return null;
            this.position++;

            return tag;
        }
        private parseName(): string {
            var oldPosition = this.position;

            var charCode = this.source.charCodeAt(this.position);
            while((charCode >= 65 && charCode <= 90) || (charCode >= 97 && charCode <= 122)) {
                charCode = this.source.charCodeAt(++this.position);
            }

            return this.source.substring(oldPosition, this.position);
        }
        private parseValue(): string {
            var oldPosition = this.position;

            var charCode = this.source.charCodeAt(this.position);
            while(++this.position < this.source.length && charCode != 32 && charCode != 93) {
                charCode = this.source.charCodeAt(this.position);
            }

            return this.source.substring(oldPosition, --this.position);
        }
        private parseText(start: number, length: number, items: any[]): void {
            if(!this.rules.maySubstitute) {
                items.push(document.createTextNode(this.source.substring(start, length)));
                return;
            }

            var position = start;
            var end = start;

            var node = this.substitutions.root;
            var prevNode = this.substitutions.root;
            while(position < length + 1) { //+ 1: Make sure we get subs at the end of the string (saves us the checking after the loop)
                node = node.nodes[this.source[position]] || null;

                if(!node) {
                    if(prevNode && prevNode.value) {
                        items.push(document.createTextNode(this.source.substring(start, end)));
                        start = position;

                        var elem = prevNode.value();
                        items.push(elem);
                    }

                    end = position;
                    node = this.substitutions.root.nodes[this.source[position]]
                    if(!node) {
                        end++;
                        node = this.substitutions.root;
                    }
                }

                prevNode = node;
                position++;
            }
            if(start != length) items.push(document.createTextNode(this.source.substring(start, length)));
        }
    }
    export class BBCodeTag {
        public Name: string;
        public Value: string;
        public Attributes: { [attributeName: string]: string } = {};
    }
    export class BBCodeRules {
        public maySubstitute = true;
        public mayParseNewTags = true;
        public mayReplaceNewLinesWithBr = true;

        public Clone() {
            var rules = new BBCodeRules();
            rules.maySubstitute = this.maySubstitute;
            rules.mayParseNewTags = this.mayParseNewTags;
            rules.mayReplaceNewLinesWithBr = this.mayReplaceNewLinesWithBr;
            return rules;
        }
    }

    export class BBCodeTagDefinition {
        private name: string;
        private isSelfClosing: boolean;

        public static Decline = {}; //TODO

        get Name(): string { return this.name; }
        get IsSelfClosing(): boolean { return this.isSelfClosing; }

        private onTag: (rules: BBCodeRules) => void;
        public OnTag(rules: BBCodeRules) { if(this.onTag) this.onTag(rules); }

        private handle: (tag: BBCodeTag, items: any[]) => any;
        public Handle(tag: BBCodeTag, items: any[]) { return this.handle(tag, items); }

        constructor(name: string, isSelfClosing: boolean, handle: (tag: BBCodeTag, items: any[]) => any, onTag?: (rules: BBCodeRules) => void) {
            this.name = name;
            this.isSelfClosing = isSelfClosing;
            this.handle = handle;
            this.onTag = onTag || null;
        }
    }
    export class Tags {
        static Pre = new BBCode.BBCodeTagDefinition(
            "pre", false,
            (tag, items) => {
                //console.log(items);
                var elem = document.createElement("pre");
                for(var i = 0; i < items.length; i++) elem.appendChild(items[i]);
                return elem;
            },
            (rules) => {
                rules.maySubstitute = false;
                rules.mayParseNewTags = false;
                rules.mayReplaceNewLinesWithBr = false;
            }
         );

        static B = new BBCode.BBCodeTagDefinition("b", false, (tag, items) => {
            //console.log(items);
            var elem = document.createElement("b");
            for(var i = 0; i < items.length; i++) elem.appendChild(items[i]);
            return elem;
        });
        static I = new BBCode.BBCodeTagDefinition("i", false, (tag, items) => {
            //console.log(items);
            var elem = document.createElement("i");
            for(var i = 0; i < items.length; i++) elem.appendChild(items[i]);
            return elem;
        });
        static U = new BBCode.BBCodeTagDefinition("u", false, (tag, items) => {
            //console.log(items);
            var elem = document.createElement("span");
            elem.style.textDecoration = "underline";

            for(var i = 0; i < items.length; i++) elem.appendChild(items[i]);
            return elem;
        });
        static S = new BBCode.BBCodeTagDefinition("s", false, (tag, items) => {
            //console.log(items);
            var elem = document.createElement("span");
            elem.style.textDecoration = "line-through";

            for(var i = 0; i < items.length; i++) elem.appendChild(items[i]);
            return elem;
        });
        static Url = new BBCode.BBCodeTagDefinition("url", false, (tag, items) => {
            //console.log(items);
            var elem = document.createElement("a");
            elem.href = tag.Value;

            var title = tag.Attributes["title"];
            if(title) elem.title = title;

            for(var i = 0; i < items.length; i++) elem.appendChild(items[i]);
            return elem;
        });
        static Spoiler = new BBCode.BBCodeTagDefinition("spoiler", false, (tag, items) => {
            //console.log(items);

            var spanElem = document.createElement("span");
            spanElem.classList.add("spoiler");
            spanElem.classList.add("hide");
            for(var i = 0; i < items.length; i++) spanElem.appendChild(items[i]);

            var inputElem = document.createElement("input");
            inputElem.classList.add("button");
            inputElem.type = "button";
            inputElem.value = "Show Spoiler";
            inputElem.onclick = () => {
                inputElem.value = spanElem.classList.toggle("hide") ? "Show Spoiler" : "Hide Spoiler";
            };

            var containerElem = document.createElement("div");
            containerElem.classList.add("spoiler");
            containerElem.appendChild(spanElem);
            containerElem.appendChild(inputElem);

            return containerElem;
        });
        static Img = new BBCode.BBCodeTagDefinition("img", true, (tag, items) => {
            //console.log(items);
            var imgElem = document.createElement("img");
            imgElem.src = tag.Value;

            var title = tag.Attributes["title"];
            if(title) imgElem.title = title;

            var width = tag.Attributes["width"];
            if(width) imgElem.width = parseInt(width);

            var height = tag.Attributes["height"];
            if(height) imgElem.width = parseInt(height);

            var containerElem = document.createElement("div");
            containerElem.appendChild(imgElem);

            var overlayElem: HTMLDivElement;

            imgElem.onclick = () => {
                if(overlayElem) {
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
    }

    export function Register(angular: ng.IAngularStatic) {
        var bbCodeModule = angular.module("bbCode", []);


        bbCodeModule.directive('bbcodeDocument', function() {
            return {
                restrict: 'E',
                replace: true,
                scope: { source: "=", transform: "=", debug: "=" },
                link: ($scope, element: JQuery, attr) => {
                    var unregister = $scope.$watch('source', function(newValue) {
                        element.empty();
                        if(!$scope.transform) return;

                        $scope.source = $scope.source || "";

                        var start = window.performance.now();
                        var bbcodeElem = $scope.transform.ToHtml($scope.source);
                        var elapsed = window.performance.now() - start;

                        if($scope.debug == true) element.append("Elapsed: " + elapsed + "ms<br>");
                        element.append(bbcodeElem);
                    });
                }
            };
        });
    }
}

if(window["angular"]) BBCode.Register(angular);