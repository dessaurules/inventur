/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('user_invites')
      return
    } catch {
      /* anlegen */
    }

    const adminOnlyRule =
      '@request.auth.id != "" && (@request.auth.is_admin = true || @request.auth.role = "admin")'

    const invites = new Collection({
      type: 'base',
      name: 'user_invites',
      listRule: adminOnlyRule,
      viewRule: adminOnlyRule,
      createRule: adminOnlyRule,
      updateRule: adminOnlyRule,
      deleteRule: adminOnlyRule,
      fields: [
        {
          type: 'email',
          name: 'email',
          required: true,
        },
        {
          type: 'text',
          name: 'token',
          required: true,
          min: 32,
          max: 128,
        },
        {
          type: 'date',
          name: 'expires_at',
          required: true,
        },
        {
          type: 'date',
          name: 'consumed_at',
          required: false,
        },
        {
          type: 'bool',
          name: 'target_is_admin',
          required: false,
        },
        {
          type: 'text',
          name: 'target_role',
          required: false,
          max: 50,
        },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_user_invites_token ON user_invites (token)'],
    })
    app.save(invites)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('user_invites'))
    } catch {
      /* */
    }
  }
)
