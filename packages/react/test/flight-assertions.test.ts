import { describe, it, expect } from 'vitest';
import React from 'react';
import {
  assertFlightSerializable,
  validateFlightSerializable,
  assertTreeFlightSerializable,
  FlightSerializationError,
  FLIGHT_SERIALIZATION_ERROR_CODE,
} from '../src/flight-assertions.js';

describe('Tier 2 Flight Serialization Assertions (@ranu/react)', () => {
  describe('assertFlightSerializable', () => {
    it('allows primitives: string, number, boolean, null, undefined', () => {
      expect(() => assertFlightSerializable('hello', 'title', 'Button')).not.toThrow();
      expect(() => assertFlightSerializable(42, 'count', 'Button')).not.toThrow();
      expect(() => assertFlightSerializable(true, 'active', 'Button')).not.toThrow();
      expect(() => assertFlightSerializable(null, 'data', 'Button')).not.toThrow();
      expect(() => assertFlightSerializable(undefined, 'optional', 'Button')).not.toThrow();
    });

    it('allows plain objects and nested arrays of serializable values', () => {
      const payload = {
        title: 'Dashboard',
        stats: [1, 2, 3],
        nested: {
          flag: false,
          tags: ['alpha', 'beta'],
        },
      };
      expect(() => assertFlightSerializable(payload, 'config', 'Dashboard')).not.toThrow();
    });

    it('allows Promise instances (React 19 async streaming props / Suspense data)', () => {
      const promise = Promise.resolve({ data: 'loaded' });
      expect(() => assertFlightSerializable(promise, 'asyncData', 'ClientWidget')).not.toThrow();

      const thenable = {
        then(resolve: any) {
          resolve('ok');
        },
      };
      expect(() => assertFlightSerializable(thenable, 'thenableData', 'ClientWidget')).not.toThrow();
    });

    it('allows React elements across the boundary', () => {
      const element = React.createElement('span', null, 'child');
      expect(() => assertFlightSerializable(element, 'slot', 'Layout')).not.toThrow();

      const transitional = {
        $$typeof: Symbol.for('react.transitional.element'),
        type: 'div',
        props: {},
      };
      expect(() => assertFlightSerializable(transitional, 'slot', 'Layout')).not.toThrow();
    });

    it('allows Server Actions marked with $$ACTION_ID or Symbol.for(react.server.reference)', () => {
      const actionFn: any = () => 'result';
      actionFn.$$ACTION_ID = 'action_create_user_123';
      expect(() => assertFlightSerializable(actionFn, 'saveAction', 'UserForm')).not.toThrow();

      const serverRefFn: any = () => 'ref';
      serverRefFn.$$typeof = Symbol.for('react.server.reference');
      expect(() => assertFlightSerializable(serverRefFn, 'queryAction', 'UserForm')).not.toThrow();
    });

    it('rejects closures and standard functions with FlightSerializationError', () => {
      const closure = () => console.log('click');
      expect(() => assertFlightSerializable(closure, 'onClick', 'Button')).toThrow(FlightSerializationError);

      try {
        assertFlightSerializable(closure, 'onClick', 'Button');
      } catch (err: any) {
        expect(err.code).toBe(FLIGHT_SERIALIZATION_ERROR_CODE);
        expect(err.componentName).toBe('Button');
        expect(err.propPath).toBe('onClick');
        expect(err.valueType).toBe('function');
        expect(err.message).toContain('Cannot pass non-serializable function prop "onClick" to Client Component <Button>');
        expect(err.hint).toContain('Move event handlers and stateful logic inside the Client Component');
      }
    });

    it('rejects Symbols not in the allowed Flight symbol set', () => {
      const sym = Symbol('custom_token');
      expect(() => assertFlightSerializable(sym, 'tokenId', 'SessionProvider')).toThrow(FlightSerializationError);

      try {
        assertFlightSerializable(sym, 'tokenId', 'SessionProvider');
      } catch (err: any) {
        expect(err.valueType).toBe('symbol');
        expect(err.message).toContain('symbol prop "tokenId"');
      }
    });

    it('rejects cyclic object structures', () => {
      const cyclic: any = { name: 'cycle' };
      cyclic.self = cyclic;

      expect(() => assertFlightSerializable(cyclic, 'node', 'GraphView')).toThrow(FlightSerializationError);
      try {
        assertFlightSerializable(cyclic, 'node', 'GraphView');
      } catch (err: any) {
        expect(err.valueType).toBe('cyclic structure');
        expect(err.message).toContain('cyclic object prop');
      }
    });

    it('rejects non-plain class instances (Date, Map, Set, custom classes)', () => {
      expect(() => assertFlightSerializable(new Date(), 'timestamp', 'TimeCard')).toThrow(FlightSerializationError);
      expect(() => assertFlightSerializable(new Map(), 'cache', 'DataCard')).toThrow(FlightSerializationError);
      expect(() => assertFlightSerializable(new Set(), 'tags', 'DataCard')).toThrow(FlightSerializationError);

      class UserSession {
        id = 'sess_1';
      }
      expect(() => assertFlightSerializable(new UserSession(), 'session', 'Profile')).toThrow(FlightSerializationError);
    });

    it('rejects prototype pollution keys (__proto__, constructor, prototype)', () => {
      const polluted = Object.create(null);
      polluted['__proto__'] = { admin: true };
      expect(() => assertFlightSerializable(polluted, 'payload', 'AdminView')).toThrow(FlightSerializationError);

      const protoProp = {
        prototype: { corrupted: true },
      };
      expect(() => assertFlightSerializable(protoProp, 'opts', 'AdminView')).toThrow(FlightSerializationError);
    });
  });

  describe('validateFlightSerializable', () => {
    it('returns structured validation result without throwing', () => {
      const valid = validateFlightSerializable({ active: true }, 'opts', 'Nav');
      expect(valid.valid).toBe(true);
      expect(valid.error).toBeUndefined();

      const invalid = validateFlightSerializable(() => {}, 'onClick', 'Button');
      expect(invalid.valid).toBe(false);
      expect(invalid.error?.componentName).toBe('Button');
      expect(invalid.error?.propName).toBe('onClick');
      expect(invalid.error?.valueType).toBe('function');
      expect(invalid.error?.hint).toContain('Move event handlers');
    });
  });

  describe('assertTreeFlightSerializable', () => {
    it('detects client component in tree with non-serializable function prop', () => {
      const ClientButton: any = ({ onClick }: any) => React.createElement('button', { onClick }, 'Click');
      ClientButton.$$typeof = Symbol.for('react.client.reference');
      ClientButton.displayName = 'ClientButton';

      const tree = React.createElement(
        'div',
        null,
        React.createElement(ClientButton, { onClick: () => alert('clicked') })
      );

      expect(() => assertTreeFlightSerializable(tree)).toThrow(FlightSerializationError);
    });

    it('allows client component in tree with serializable props and valid children', () => {
      const ClientCard: any = ({ title, count, children }: any) =>
        React.createElement('div', null, [title, count, children]);
      ClientCard.__ranu_client__ = true;
      ClientCard.displayName = 'ClientCard';

      const tree = React.createElement(
        'div',
        null,
        React.createElement(
          ClientCard,
          { title: 'Overview', count: 42 },
          React.createElement('span', null, 'Inner')
        )
      );

      expect(() => assertTreeFlightSerializable(tree)).not.toThrow();
    });
  });
});
