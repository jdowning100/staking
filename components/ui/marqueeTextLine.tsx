import Marquee from 'react-fast-marquee';
import { cn } from '@/lib/utils';

interface IMarqueeTextLine {
  text: string;
  customStyle?: string;
}

const MarqueeTextLine = ({ text, customStyle }: IMarqueeTextLine) => {
  return (
    <div
      className={cn('max-w-full h-8 overflow-hidden font-semibold uppercase bg-red-9 flex items-center', {
        customStyle: customStyle,
      })}
    >
      <Marquee autoFill>
        <div className="text-text-md font-monorama">{text}</div>
      </Marquee>
    </div>
  );
};

export default MarqueeTextLine;
