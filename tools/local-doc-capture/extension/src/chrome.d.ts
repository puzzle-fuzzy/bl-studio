declare namespace chrome {
  namespace runtime {
    const onMessage: {
      addListener(
        listener: (
          message: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void,
        ) => boolean | undefined,
      ): void;
    };

    function sendMessage<TResponse = unknown>(
      message: unknown,
    ): Promise<TResponse>;
    function getManifest(): { version: string };
  }

  namespace tabs {
    type Tab = { id?: number; url?: string };

    const onUpdated: {
      addListener(
        listener: (
          tabId: number,
          changeInfo: { status?: string; url?: string },
          tab: Tab,
        ) => void,
      ): void;
    };

    function query(options: {
      active: boolean;
      currentWindow: boolean;
    }): Promise<Tab[]>;

    function update(
      tabId: number,
      updateProperties: { url: string },
    ): Promise<Tab>;
  }

  namespace storage {
    namespace local {
      function get(keys: string | string[]): Promise<Record<string, unknown>>;
      function set(items: Record<string, unknown>): Promise<void>;
    }
  }

  namespace scripting {
    function executeScript<T>(options: {
      target: { tabId: number };
      func: () => Promise<T> | T;
    }): Promise<Array<{ result?: T }>>;
  }
}

declare const __LOCAL_CAPTURE_SERVER_ORIGIN__: string;
declare const __LOCAL_DOC_CAPTURE_TOKEN__: string;
declare const __LOCAL_DOC_CAPTURE_QUEUE__: readonly {
  path: string;
  url: string;
  navigationPath: readonly string[];
  origin: string;
}[];
