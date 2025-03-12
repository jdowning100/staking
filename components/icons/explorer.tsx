import { IconColor } from '@/components/icons/index';
import { LiaRocketSolid } from 'react-icons/lia';

const ExplorerIcon = ({ color = IconColor.GREY, size = '24px', ...props }) => {
  return <LiaRocketSolid size={size} color={color} {...props} />;
};

export { ExplorerIcon };
