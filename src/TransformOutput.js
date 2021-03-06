/*eslint no-new-func: 0*/
import Editor from './Editor';
import React from 'react';
import halts, {loopProtect} from 'halting-problem';
import {SourceMapConsumer} from 'source-map/lib/source-map-consumer';

function transform(transformer, transformCode, code) {
  if (!transformer._promise) {
    transformer._promise = new Promise(transformer.loadTransformer);
  }
  // Use Promise.resolve(null) to return all errors as rejected promises
  return transformer._promise.then(realTransformer => {
    // assert that there are no obvious infinite loops
    halts(transformCode);
    // guard against non-obvious loops with a timeout of 5 seconds
    let start = Date.now();
    transformCode = loopProtect(
      transformCode,
      [
        // this function gets called in all possible loops
        // it gets passed the line number as its only argument
        '(function (line) {',
        'if (Date.now() > ' + (start + 5000) + ') {',
        '  throw new Error("Infinite loop detected on line " + line);',
        '}',
        '})',
      ].join('')
    );
    let result = transformer.transform(
      realTransformer,
      transformCode,
      code,
    );
    let map = null;
    if (typeof result !== 'string') {
      map = new SourceMapConsumer(result.map);
      result = result.code;
    }
    return { result, map };
  });
}

export default class TransformOutput extends React.Component {
  static propTypes = {
    transformer: React.PropTypes.object,
    transformCode: React.PropTypes.string,
    code: React.PropTypes.string,
  };

  constructor(props) {
    super(props);
    this.state = {
      result: '',
      map: null,
      error: null,
    };
    this._posFromIndex = this._posFromIndex.bind(this);
  }

  componentDidMount() {
    transform(
      this.props.transformer,
      this.props.transformCode,
      this.props.code,
    ).then(
      ({ result, map }) => this.setState({ result, map }),
      error => this.setState({ error })
    );
  }

  componentWillReceiveProps(nextProps) {
    if (this.props.transformCode !== nextProps.transformCode ||
        this.props.code !== nextProps.code) {
      if (console.clear) {
        console.clear();
      }
      transform(
        nextProps.transformer,
        nextProps.transformCode,
        nextProps.code,
      ).then(
        ({ result, map }) => ({ result, map, error: null }),
        error => {
          console.error(error);
          return { error };
        }
      ).then(state => this.setState(state));
    }
  }

  shouldComponentUpdate(nextProps, nextState) {
    return this.state.result !== nextState.result ||
      this.state.error !== nextState.error;
  }

  _posFromIndex(pos, doc) {
    const {map} = this.state;
    if (!map) {
      return;
    }
    const src = map.sourcesContent[0];
    if (pos === 0) {
      return { line: 0, ch: 0 };
    }
    let lineStart = src.lastIndexOf('\n', pos - 1);
    let column = pos - lineStart - 1;
    let line = 1;
    while (lineStart >= 0) {
      lineStart = src.lastIndexOf('\n', lineStart - 1);
      line++;
    }
    ({ line, column } = map.generatedPositionFor({
      line,
      column,
      source: map.sources[0],
    }));
    if (line === null || column === null) {
      return;
    }
    return { line: line - 1, ch: column };
  }

  render() {
    return (
      <div className="output highlight">
        {this.state.error ?
          <Editor
            highlight={false}
            key="error"
            lineNumbers={false}
            readOnly={true}
            defaultValue={this.state.error.message}
          /> :
          <Editor
            posFromIndex={this._posFromIndex}
            mode={this.props.mode}
            key="output"
            readOnly={true}
            defaultValue={this.state.result}
          />
        }
      </div>
    );
  }
}
