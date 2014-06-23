#BBCodeTransform#
Demo page: http://dvdkhl.github.io/BBCodeTransform/


##What does BBCodeTransform try to achieve?##
BBCodeTransform is a TypeScript/JavaScript BBCode to Html transformer that *does not depend any required external frameworks*. It aims to be easily extendable, giving various possibilities to add new bbcode tags and substitutions (e.g. smilies).  
**Usage:** Transforming BBCode into Html is simply done by creating an instance, specifying the BBCode Tags/Substitutions that should be used and then calling `.ToHtml(bbCodeSrc)` on the instance. The output will be a HTMLDivElement.  
**Tag Parameters:** Besides the traditional `[tagName=tagValue]` tags, BBCodeTransform also supports additional parameters in the form of `[tagName=tagValue paramName1=paramValue1 paramName2=paramValue2 ...]` allowing for more feature rich tags.  
**Custom Tags:** Custom BBCode Tags and Substitutions contain callbacks which are called after that item has been fully parsed. In case of tags, the callback parameters include the name, its value and possible attributes and as the second parameter the HTMLElements within.  
Since the HTMLElements are supplied and not a string, it is *easy to add TypeScript/JavaScript for more dynamic functionality (e.g. Image Overlays, Spoilerboxes, etc)*.  
**Rules:** Before the content of a tag is parsed *each tag is asked to set their parsing rules* which include `maySubstitute, mayParseNewTags, mayReplaceNewLinesWithBr` to more finely control the parsing behavior to allow the implementation of for example *code* tags. After the tag is fully processed the parsing rules are reverted to its previous state automatically.  
**Performance:** BBCodeTransform should be close to the fastest ones out there (No regex or string concatenation is used for parsing and substitutions are done using a trie) under the condition that you want Html Elements as output. If on the other hand you're only interested in the resulting *html string* and are not planning to add it to the Dom (e.g. setting `innerHTML`) other libraries may outperform it by orders of magnitude.  
*To put things into perspective:* Transforming and displaying 64kb of bbcode takes around 60ms with BBCodeTransform. While other parsers which output html as a string may take several hundred ms to do the same, but may take a lot less than 10ms if the string isn't added to the Dom.  
Still in most cases any implementation is fast enough so performance shoudn't be an issue.

##Usage##
####Instance creation and setup####
```typescript
var transform = new BBCode.BBCodeTransform();
transform.SetTagDefinitions([
  BBCode.Tags.B, BBCode.Tags.I, BBCode.Tags.S, BBCode.Tags.U,
  BBCode.Tags.Url, BBCode.Tags.Img, BBCode.Tags.Spoiler, BBCode.Tags.Pre
]);
transform.SetSubstitutions([
  {
    match: ":)", replacement: function () {
      var elem = document.createElement("span");
      elem.className = "i_icon i_icon_smiley_happy";
      elem.title = "happy";
      return elem;
    }
  }
]);
```
Here we create an instance of BBCodeTransform and setting some BBCode Tags and one substitution. Using the `transform.SetTagDefinitions` function we can pass an array of `TagDefinitions` which will be used to transform the BBCode.
Some predefined tags already come with BBCodeTransform and are used in the code above.  
The `transform.SetSubstitutions` can be used to pass an array of substitution rules which was mainly introduced to support smilies but can also be used for different purposes (e.g. replacing keywords with something else).  
After this setup a single call to `transform.ToHtml(bbCode)` will transform the bbcode and output an Html (Div) Element, ready to be added to the Dom.

####Custom BBCodeTags####
To create new Tags a new instance of BBCodeTagDefinition needs to be created:
```typescript
constructor(
  name: string, //Name of the tag, used by the parser to identify tags
  isSelfClosing: boolean, //Should the parser expect a closing tag? (Similar to <br>)
  handle: (tag: BBCodeTag, items: any[]) => any, //Callback for custom tag transformation
  onTag?: (rules: BBCodeRules) => void //Used to set parsing rules
)

class BBCodeTag {
    public Name: string;
    public Value: string;
    public Attributes: { [attributeName: string]: string } = {};
}
//handle > items: Parsed Html Elements of the tag content

class BBCodeRules {
  public maySubstitute;
  public mayParseNewTags;
  public mayReplaceNewLinesWithBr;
}
```
Afterwards simply include the new instance in the array for `SetTagDefinitions`.

**Examples:**
```typescript
//Pre tag example:
new BBCode.BBCodeTagDefinition(
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
)

//Image tag example
new BBCode.BBCodeTagDefinition("img", true, (tag, items) => {
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
})
```

####Adding Substitutions (Smilies)####
To add substitutions you simple need to create an array of the fowllowing format:  
`{match: "matchString", replacement: function() { /*Code returning an HTML Element*/ }}`  
If an exact match with the value of "match" is found the callback is called which must return an HTML Element.
The HTML Element is then used to replace the matched text.

####AngularJs####
If AngularJs is available, BBCodeTransform will register a module with a directive called `bbcodeDocument`, which allows for simple binding between the BBCode and the view.

####TODO:####
- [ ] Maybe: Substitutions with parameters (e.g. Item{Id=100})
- [ ] More parsing rules

