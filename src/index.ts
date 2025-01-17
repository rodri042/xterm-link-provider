import type {IBufferCellPosition, ILink, ILinkProvider, Terminal} from 'xterm';

type ILinkProviderOptions = Omit<ILink, 'range' | 'text' | 'activate'>;

export class LinkProvider implements ILinkProvider {
  /**
   * Create a Link Provider for xterm.js
   * @param _terminal The terminal instance
   * @param _regex The regular expression to use for matching
   * @param _handler Callback for when link is clicked
   * @param _options Further hooks, eg. hover, leave and decorations
   * @param _matchIndex The index to use from regexp.exec result, default 1
   */
  constructor(
    private readonly _terminal: Terminal,
    private readonly _regex: RegExp,
    private readonly _handler: ILink['activate'],
    private readonly _options: ILinkProviderOptions = {},
    private readonly _matchIndex = 1
  ) {}

  public provideLinks(y: number, callback: (links: ILink[] | undefined) => void): void {
    const links = computeLink(y, this._regex, this._terminal, this._matchIndex).map(
      (_link): ILink => ({
        range: _link.range,
        text: _link.text,
        activate: this._handler,
        ...this._options
      })
    );
    callback(links);
  }
}
/**
 * Find link range and text for the given line and regex
 * @param y The line number to process
 * @param regex The regular expression to use for matching
 * @param terminal The terminal instance
 * @param matchIndex The index to use from regexp.exec result, default 1
 */
export const computeLink = (y: number, regex: RegExp, terminal: Terminal, matchIndex = 1) => {
  const rex = new RegExp(
    regex.source,
    ((regex.flags || '') + 'g')
      .split('')
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .join('')
  );

  const [line, startLineIndex] = translateBufferLineToStringWithWrap(y - 1, terminal);

  let match;
  let stringIndex = -1;
  const result: Pick<ILink, 'range' | 'text'>[] = [];

  while ((match = rex.exec(line)) !== null) {
    const text = match[matchIndex];
    if (!text) {
      // something matched but does not comply with the given matchIndex
      // since this is most likely a bug the regex itself we simply do nothing here
      console.log('match found without corresponding matchIndex');
      break;
    }

    // Get index, match.index is for the outer match which includes negated chars
    // therefore we cannot use match.index directly, instead we search the position
    // of the match group in text again
    // also correct regex and string search offsets for the next loop run
    stringIndex = line.indexOf(text, stringIndex + 1);

    // correct index for emoji support (double characters)
    const surrogatePairs =
      line.substring(0, stringIndex).length - [...line.substring(0, stringIndex)].length;
    stringIndex -= surrogatePairs;

    rex.lastIndex = stringIndex + text.length;
    if (stringIndex < 0) {
      // invalid stringIndex (should not have happened)
      break;
    }

    let endX = stringIndex + text.length;
    let endY = startLineIndex + 1;
    while (endX > terminal.cols) {
      endX -= terminal.cols;
      endY++;
    }

    let startX = stringIndex + 1;
    let startY = startLineIndex + 1;
    while (startX > terminal.cols) {
      startX -= terminal.cols;
      startY++;
    }

    const range = {
      start: {
        x: startX,
        y: startY
      },
      end: {
        x: endX,
        y: endY
      }
    };

    result.push({range, text});
  }

  return result;
};

const translateBufferLineToStringWithWrap = (
  lineIndex: number,
  terminal: Terminal
): [string, number] => {
  let lineString = '';
  let lineWrapsToNext: boolean;
  let prevLinesToWrap: boolean;

  do {
    const line = terminal.buffer.active.getLine(lineIndex);
    if (!line) {
      break;
    }

    if (line.isWrapped) {
      lineIndex--;
    }

    prevLinesToWrap = line.isWrapped;
  } while (prevLinesToWrap);

  const startLineIndex = lineIndex;

  do {
    const nextLine = terminal.buffer.active.getLine(lineIndex + 1);
    lineWrapsToNext = nextLine ? nextLine.isWrapped : false;
    const line = terminal.buffer.active.getLine(lineIndex);
    if (!line) {
      break;
    }
    lineString += line.translateToString(true);
    lineIndex++;
  } while (lineWrapsToNext);

  return [lineString, startLineIndex];
};
