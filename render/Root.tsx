import React from 'react';
import { Composition } from 'remotion';
import { FlowBizVerticalShort, type FlowBizVerticalShortProps } from './VerticalShort';

const defaultProps: FlowBizVerticalShortProps = {
  audioFileName: 'audio.wav',
  captions: [],
  disclosure: 'AI-generated narration and visuals.',
  durationInFrames: 30,
  language: 'en',
  projectId: 'project-preview',
};

export const FlowBizRenderRoot: React.FC = () => (
  <Composition<any, FlowBizVerticalShortProps>
    id="FlowBizVerticalShort"
    component={FlowBizVerticalShort}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    defaultProps={defaultProps}
    calculateMetadata={({ props }) => ({ durationInFrames: props.durationInFrames })}
  />
);
