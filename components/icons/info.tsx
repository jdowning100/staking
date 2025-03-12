import { IconColor } from '@/components/icons/index';
import { TfiInfoAlt } from 'react-icons/tfi';

const InfoIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <TfiInfoAlt size={size} color={color} {...props} />;
};

export { InfoIcon };
