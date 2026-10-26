import React from 'react';
import { View } from 'react-native';
import type { ChatMessage } from '../api/types';
import { useTheme } from '../theme/ThemeProvider';
import { radius, space } from '../theme/tokens';
import { CodeBlock } from './question';
import { AppText, Row } from './primitives';
import { Mascot } from './Mascot';

/** Renders the small Markdown subset the tutor uses: **bold**, *italic*, `code`, bullets, ``` blocks. */
function Inline({ text, color }: { text: string; color: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g).filter(Boolean);
  return (
    <AppText color={color}>
      {parts.map((p, i) =>
        p.startsWith('**') ? (
          <AppText key={i} variant="bodyBold" color={color}>
            {p.slice(2, -2)}
          </AppText>
        ) : p.startsWith('`') ? (
          <AppText key={i} color={color} style={{ fontFamily: 'monospace' }}>
            {p.slice(1, -1)}
          </AppText>
        ) : p.startsWith('*') && p.length > 2 ? (
          <AppText key={i} color={color} style={{ fontStyle: 'italic' }}>
            {p.slice(1, -1)}
          </AppText>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </AppText>
  );
}

export function MarkdownText({ content, color }: { content: string; color: string }) {
  const blocks = content.split(/```(?:\w+)?\n?/);
  return (
    <View style={{ gap: space.sm }}>
      {blocks.map((block, bi) =>
        bi % 2 === 1 ? (
          <CodeBlock key={bi} code={block.replace(/\n$/, '')} />
        ) : (
          block
            .split('\n')
            .filter((l, i, arr) => l.trim() || (i > 0 && arr[i - 1]?.trim()))
            .map((line, li) => {
              const bullet = /^\s*([-*•]|\d+\.)\s+/.exec(line);
              const heading = /^#{1,3}\s+/.exec(line);
              if (!line.trim()) return <View key={`${bi}-${li}`} style={{ height: 2 }} />;
              if (heading)
                return (
                  <AppText key={`${bi}-${li}`} variant="subheading" color={color}>
                    {line.replace(heading[0], '')}
                  </AppText>
                );
              if (bullet)
                return (
                  <Row key={`${bi}-${li}`} align="flex-start" gap={6}>
                    <AppText color={color}>{/\d/.test(bullet[1]!) ? bullet[1] : '•'}</AppText>
                    <View style={{ flex: 1 }}>
                      <Inline text={line.replace(bullet[0], '')} color={color} />
                    </View>
                  </Row>
                );
              return <Inline key={`${bi}-${li}`} text={line} color={color} />;
            })
        ),
      )}
    </View>
  );
}

export function AIChatBubble({ message }: { message: ChatMessage }) {
  const t = useTheme();
  const mine = message.role === 'user';
  if (mine) {
    return (
      <View style={{ alignSelf: 'flex-end', maxWidth: '85%', backgroundColor: t.colors.primary, borderRadius: radius.card, borderBottomRightRadius: 6, padding: space.md, opacity: message.pending ? 0.7 : 1 }}>
        <AppText color="#fff">{message.content}</AppText>
      </View>
    );
  }
  return (
    <Row align="flex-start" gap={space.sm} style={{ maxWidth: '94%' }}>
      <Mascot size={34} bounce={false} />
      <View
        accessibilityLabel={`Tutor: ${message.content}`}
        style={{ flex: 1, backgroundColor: t.colors.surface, borderWidth: 1, borderColor: t.colors.border, borderRadius: radius.card, borderTopLeftRadius: 6, padding: space.md }}
      >
        <MarkdownText content={message.content} color={t.colors.text} />
      </View>
    </Row>
  );
}

export function TypingBubble() {
  const t = useTheme();
  return (
    <Row align="flex-start" gap={space.sm}>
      <Mascot size={34} mood="think" />
      <View style={{ backgroundColor: t.colors.surface, borderRadius: radius.card, padding: space.md, borderWidth: 1, borderColor: t.colors.border }}>
        <AppText muted>Thinking…</AppText>
      </View>
    </Row>
  );
}
