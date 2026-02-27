import type { Socket } from 'socket.io';

export const registerSocketCommandHandlers = (socket: Socket): void => {
  socket.on('startSimulation', (payload: number) => {
    console.log('[socket] startSimulation invoked', {
      socketId: socket.id,
      classRoomId: payload,
    });
  });
};

