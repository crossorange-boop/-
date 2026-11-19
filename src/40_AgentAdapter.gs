/**
 * 40_AgentAdapter.gs
 * 外部AI接続アダプターの共通インターフェース。
 *
 * 統括機能（振り分け・状態管理）は特定のAIに依存せず、AIとのやり取りだけをアダプターに任せる。
 * アダプターは connection_type ごとに登録し、次のメソッドを持つ：
 *   dispatch(task, agent) → { mode: 'QUEUED' | 'SENT', message }
 *     QUEUED：作業待ちキューに置くだけ（人が指示書を各AIに手渡しする）
 *     SENT  ：公式API等で送信済み（Phase 2 以降）
 *
 * Phase 1 は MANUAL_QUEUE / INTERNAL のみ。いずれも外部へは何も送信しない。
 * Phase 2 で n8n・公式API・ローカルAI 用のアダプターを register() で追加する。
 * 認証情報は PropertiesService に保存し、コードやシートには書かないこと。
 */

var AgentAdapter = (function () {
  var registry = {};

  var ManualQueueAdapter = {
    dispatch: function (task, agent) {
      return { mode: 'QUEUED', message: agent.agent_name + ' の作業待ちキューに追加しました' };
    }
  };

  function register(connectionType, adapter) {
    if (!adapter || typeof adapter.dispatch !== 'function') throw new Error('アダプターには dispatch(task, agent) が必要です');
    registry[connectionType] = adapter;
  }

  /** 未登録の接続方式は手動キューとして扱う（外部送信はしない） */
  function get(connectionType) {
    return registry[connectionType] || ManualQueueAdapter;
  }

  register('MANUAL_QUEUE', ManualQueueAdapter);
  register('INTERNAL', ManualQueueAdapter);

  return { register: register, get: get, ManualQueueAdapter: ManualQueueAdapter };
})();
