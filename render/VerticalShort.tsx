import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';

export interface RenderCaption {
  startFrame: number;
  endFrame: number;
  text: string;
}

export interface FlowBizVerticalShortProps extends Record<string, unknown> {
  audioFileName: string;
  captions: RenderCaption[];
  disclosure: string;
  durationInFrames: number;
  language: 'th' | 'en';
  projectId: string;
}

export const FlowBizVerticalShort: React.FC<FlowBizVerticalShortProps> = ({
  audioFileName,
  captions,
  disclosure,
  language,
  projectId,
}) => {
  const frame = useCurrentFrame();
  const caption = captions.find((item) => frame >= item.startFrame && frame < item.endFrame);
  const fontFamily = language === 'th' ? 'Tahoma, Arial, sans-serif' : 'Arial, sans-serif';

  return (
    <AbsoluteFill style={{
      background: 'linear-gradient(160deg, #081525 0%, #102f45 58%, #0a7f72 100%)',
      color: '#f8fafc',
      fontFamily,
      padding: '104px 76px 88px',
    }}>
      <Audio src={staticFile(audioFileName)} />
      <div style={{ color: '#5eead4', fontSize: 38, fontWeight: 800, letterSpacing: 7 }}>FLOWBIZ</div>
      <div style={{ fontSize: 76, fontWeight: 900, lineHeight: 1.05, marginTop: 54, maxWidth: 900 }}>
        Creator Factory
      </div>
      <div style={{ color: '#a7f3d0', fontSize: 30, marginTop: 22 }}>{projectId}</div>
      <div style={{ flex: 1 }} />
      <div style={{
        alignItems: 'center',
        background: caption ? 'rgba(3, 15, 27, 0.9)' : 'transparent',
        borderRadius: 28,
        display: 'flex',
        fontSize: 54,
        fontWeight: 800,
        justifyContent: 'center',
        lineHeight: 1.28,
        minHeight: 260,
        padding: '38px 44px',
        textAlign: 'center',
        whiteSpace: 'pre-line',
      }}>
        {caption?.text ?? ''}
      </div>
      <div style={{ color: '#cbd5e1', fontSize: 22, lineHeight: 1.35, marginTop: 44 }}>{disclosure}</div>
    </AbsoluteFill>
  );
};
