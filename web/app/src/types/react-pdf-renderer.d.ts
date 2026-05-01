declare module "@react-pdf/renderer" {
  import * as React from "react";

  interface Style {
    [key: string]: string | number | undefined;
  }

  interface DocumentProps {
    title?: string;
    author?: string;
    subject?: string;
    creator?: string;
    keywords?: string;
    producer?: string;
    children?: React.ReactNode;
  }

  interface PageProps {
    size?: string | number | [number, number];
    style?: Style | Style[];
    wrap?: boolean;
    children?: React.ReactNode;
  }

  interface ViewProps {
    style?: Style | Style[];
    wrap?: boolean;
    children?: React.ReactNode;
  }

  interface TextProps {
    style?: Style | Style[];
    wrap?: boolean;
    children?: React.ReactNode;
  }

  interface ImageProps {
    src: string | { uri: string; method?: string; headers?: Record<string, string>; body?: string };
    style?: Style | Style[];
  }

  export class Document extends React.Component<DocumentProps> {}
  export class Page extends React.Component<PageProps> {}
  export class View extends React.Component<ViewProps> {}
  export class Text extends React.Component<TextProps> {}
  export class Image extends React.Component<ImageProps> {}

  export const StyleSheet: {
    create: <T extends Record<string, Style>>(styles: T) => T;
  };

  export const renderToBuffer: (
    document: React.ReactElement<DocumentProps>
  ) => Promise<Buffer>;
}
