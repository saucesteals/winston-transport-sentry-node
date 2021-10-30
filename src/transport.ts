import TransportStream = require("winston-transport");

const DEFAULT_LEVELS_MAP: SeverityOptions = {
  silly: "debug",
  verbose: "debug",
  info: "info",
  debug: "debug",
  warn: "warning",
  error: "error",
};

export interface SentryTransportOptions
  extends TransportStream.TransportStreamOptions {
  sentry: any;
  levelsMap?: SeverityOptions;
}

interface SeverityOptions {
  [key: string]: string;
}

class ExtendedError extends Error {
  constructor(info: any) {
    super(info.message);

    this.name = info.name || "Error";
    if (info.stack) {
      this.stack = info.stack;
    }
  }
}

export default class SentryTransport extends TransportStream {
  public silent = false;
  private sentry: any;
  private levelsMap = {};

  public constructor(opts: SentryTransportOptions) {
    super(opts);

    this.levelsMap = this.setLevelsMap(opts && opts.levelsMap);
    this.silent = (opts && opts.silent) || false;
    this.sentry = opts?.sentry;
  }

  public log(info: any, callback: () => void): void {
    /* eslint-disable */
    setImmediate(() => {
      this.emit("logged", info);
    });

    if (this.silent) return callback();

    const { message, tags, level, category, type, extra } = info;

    const sentryLevel = (this.levelsMap as any)[level];

    if (SentryTransport.shouldLogException(sentryLevel)) {
      const error =
        message instanceof Error ? message : new ExtendedError(info);
      this.sentry.captureException(error, { tags, extra });

      return callback();
    }

    const data = {} as any;

    if (extra) data.extra = extra;
    if (tags) data.tags = tags;

    // Capturing breadcrumbs
    this.sentry.addBreadcrumb({
      message,
      level: sentryLevel,
      category,
      type,
      data,
    });
    return callback();
    /* eslint-enable */
  }

  end(...args: any[]): void {
    this.sentry.flush().then(() => {
      super.end(...args);
    });
  }

  private setLevelsMap = (options?: SeverityOptions): SeverityOptions => {
    if (!options) {
      return DEFAULT_LEVELS_MAP;
    }

    const customLevelsMap = Object.keys(options).reduce(
      (acc: { [key: string]: any }, winstonSeverity: string) => {
        acc[winstonSeverity] = this.sentry.Severity.fromString(
          options[winstonSeverity]
        );
        return acc;
      },
      {}
    );

    return {
      ...DEFAULT_LEVELS_MAP,
      ...customLevelsMap,
    };
  };

  // private normalizeMessage(msg: any) {
  //   return msg && msg.message ? msg.message : msg;
  // }

  private static shouldLogException(level: string) {
    return level === "fatal" || level === "error";
  }
}
