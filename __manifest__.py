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
        'views/analytic_create.xml',
    ],
    'demo': [
    ],

    'installable': True,
    'application': True,
    'auto_install': False,
}
