# __manifest__.py
{
    'name': "Module de Gestion Analytique",
    'summary': "Gestion des résultats analytiques par exploitation",
    'description': """
        Module Odoo pour gérer les résultats analytiques, calculer les totaux par exploitation,
        et fournir des rapports dynamiques.
    """,
    'author': "Ogooué Technologies",
    'website': "https://ogoouetech.com",
    'sequence': -101,
    'category': 'Accounting',
    'version': '1.0',
    'depends': ['base', 'web', 'bus'],
    'data': [
        'security/ir.model.access.csv',
        'views/analytic_menu.xml',
        'views/dashboard_action.xml',
        'views/analytic_dashboard_views.xml',
    ],
    'assets': {
        'web.assets_backend': [
             # Chargement des bibliothèques tierces en premier
            'https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js',
            'https://cdn.jsdelivr.net/npm/chart.js@4.4.7/dist/chart.umd.min.js',

            'analytic_manager/static/src/js/dashboard.js',
            'analytic_manager/static/src/xml/dashboard.xml',
            'analytic_manager/static/src/css/material-dashboard.css',
        ],
    },
    'demo': [
    ],
    'installable': True,
    'application': True,
    'auto_install': False,
}
