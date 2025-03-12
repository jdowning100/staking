import { IconColor } from '@/components/icons/index';
import { LuList } from 'react-icons/lu';

const BreakdownIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <LuList size={size} color={color} {...props} />;
};

export { BreakdownIcon };
