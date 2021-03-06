import {
  DendronError,
  DLink,
  DNoteLink,
  DNoteLoc,
  NotePropsV2,
  NoteUtilsV2,
} from "@dendronhq/common-all";
import _ from "lodash";
import { Heading } from "mdast";
import {
  brk,
  heading,
  paragraph,
  root as mdastRoot,
  text,
} from "mdast-builder";
import remark from "remark";
import abbrPlugin from "remark-abbr";
import frontmatterPlugin from "remark-frontmatter";
import markdownParse from "remark-parse";
import { ReplaceLinkOpts } from "../../types";
import {
  DendronLinksOpts,
  dendronLinksPlugin,
} from "./plugins/dendronLinksPlugin";
import { dendronNoteRefPluginForMd } from "./plugins/dendronNoteRefPlugin";
import { WikiLinkNote } from "./plugins/types";

export const WIKI_LINK_VALUE_RE = /(^\])/;

const selectAll = require("unist-util-select").selectAll;

export class ParserUtilsV2 {
  static createWikiLinkRE(opts?: { oldLink: string }) {
    const { oldLink } = opts || {};
    if (oldLink) {
      const match = ParserUtilsV2.escapeForRegExp(oldLink);
      return `\\[\\[\\s*?(.*\\|)?\\s*${match}\\s*\\]\\]`;
    }
    return "\\[\\[\\s*?(.*\\|)?\\s*(?<name>.*)\\s*\\]\\]";
  }

  /**
   * - parse frontmatter
   * - parse wiki links
   * @param opts
   */
  static getRemark(opts?: {
    dendronLinksOpts: DendronLinksOpts;
    dendronNoteRefPluginForMdOpts?: Parameters<
      typeof dendronNoteRefPluginForMd
    >[0];
    useDendronNoteRefPluginForMd?: boolean;
  }) {
    const {
      dendronLinksOpts,
      useDendronNoteRefPluginForMd,
      dendronNoteRefPluginForMdOpts: dendronRefLinkOpts,
    } = _.defaults(opts, {
      dendronLinksOpts: {},
      useDendronNoteRefPluginForMd: true,
      dendronRefLinkOpts: {},
    });
    const errors: DendronError[] = [];
    let plugin = remark()
      .data("errors", errors)
      .use(markdownParse, { gfm: true })
      .use(abbrPlugin)
      .use(frontmatterPlugin, ["yaml"])
      .use(dendronLinksPlugin, dendronLinksOpts)
      .use({ settings: { listItemIndent: "1", fences: true, bullet: "-" } });
    if (useDendronNoteRefPluginForMd) {
      plugin.use(dendronNoteRefPluginForMd, dendronRefLinkOpts);
    }
    return plugin;
  }

  static findHeaders(content: string): Heading[] {
    let remark = ParserUtilsV2.getRemark();
    let out = remark.parse(content);
    let out2: Heading[] = selectAll("heading", out);
    return out2;
  }

  /**
   * Get all links from the note body
   * Currently, just look for wiki links
   * @param param0
   */
  static findLinks({ note }: { note: NotePropsV2 }): DLink[] {
    const content = note.body;
    let remark = ParserUtilsV2.getRemark();
    let out = remark.parse(content);
    let out2: WikiLinkNote[] = selectAll("wikiLink", out);
    // let refLink = selectAll("refLink", out)
    const dlinks = out2.map(
      (m: WikiLinkNote) =>
        ({
          type: "wiki",
          from: NoteUtilsV2.toLoc(note),
          original: m.value,
          value: m.value,
          alias: m.data.alias,
          pos: { start: m.position?.start.offset, end: m.position?.end.offset },
          to: {
            fname: m.value,
            anchorHeader: m.data.anchorHeader,
          },
        } as DLink)
    );
    return dlinks as DLink[];
  }

  static escapeForRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  static genMDError(opts: { msg: string; title: string }) {
    const { msg, title } = opts;
    return mdastRoot([
      heading(3, text(title)),
      paragraph([paragraph(text(msg)), brk]),
    ]);
  }

  static async replaceLinks(opts: {
    content: string;
    from: DNoteLoc;
    to: DNoteLoc;
  }) {
    const { content, from, to } = opts;
    let remark = ParserUtilsV2.getRemark({
      dendronLinksOpts: {
        replaceLink: { from, to },
      },
      dendronNoteRefPluginForMdOpts: {
        replaceLink: { from, to },
      },
    });
    const out = await remark.process(content);
    return out.toString();
  }
}

export class RemarkUtilsV2 {
  static replaceLink({
    link,
    opts,
  }: {
    link: DNoteLink;
    opts: ReplaceLinkOpts;
  }) {
    if (opts.from.fname === link.from.fname) {
      // TODO: check for case
      link.from.fname = opts.to.fname;
      if (link.from.alias === opts.from.fname) {
        link.from.alias = opts.to.fname;
      }
    }
    return link;
  }
}
