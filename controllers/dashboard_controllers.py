# controllers\dashboard_controllers.py
# -*- coding: utf-8 -*-
from odoo import http
from odoo.http import request

class DashboardControllers(http.Controller):

    @http.route('/analytic_dashboard/data', type='json', auth='user')
    def get_analytic_data(self, exploitation, **kwargs):
        """
        Retourne la liste des projets filtrés par exploitation.
        """
        # On cherche dans analytic.dashboard (un seul modèle)
        projects = request.env['analytic.dashboard'].sudo().search([
            ('exploitation', '=', exploitation)
        ])
        # On renvoie une liste de dictionnaires
        data = []
        for p in projects:
            data.append({
                'id': p.id,
                'exploitation': p.exploitation,
                'project_code': p.project_code,
                'libelle': p.libelle,
                'marche_initial': p.marche_initial or 0.0,
                'ts': p.ts or 0.0,
                'factures_cumulees': p.factures_cumulees or 0.0,
                'od_facture': p.od_facture or 0.0,
                'non_facture': p.non_facture or 0.0,
                'trop_facture': p.trop_facture or 0.0,
                'depenses_cumulees': p.depenses_cumulees or 0.0,
                'debours_previsionnels': p.debours_previsionnels or 0.0,
            })
        return data

    @http.route('/analytic_dashboard/update', type='json', auth='user')
    def update_analytic_data(self, project_data, **kwargs):
        """
        Met à jour un seul projet en base, suite à une modification.
        """
        pid = project_data.get('id')
        if pid:
            project = request.env['analytic.dashboard'].sudo().browse(pid)
            if project.exists():
                project.write({
                    'exploitation': project_data.get('exploitation'),
                    'project_code': project_data.get('project_code'),
                    'libelle': project_data.get('libelle'),
                    'marche_initial': project_data.get('marche_initial', 0.0),
                    'ts': project_data.get('ts', 0.0),
                    'factures_cumulees': project_data.get('factures_cumulees', 0.0),
                    'od_facture': project_data.get('od_facture', 0.0),
                    'non_facture': project_data.get('non_facture', 0.0),
                    'trop_facture': project_data.get('trop_facture', 0.0),
                    'depenses_cumulees': project_data.get('depenses_cumulees', 0.0),
                    'debours_previsionnels': project_data.get('debours_previsionnels', 0.0),
                })
        else:
            # Création si pas d'ID
            request.env['analytic.dashboard'].sudo().create({
                'exploitation': project_data.get('exploitation'),
                'project_code': project_data.get('project_code'),
                'libelle': project_data.get('libelle'),
                'marche_initial': project_data.get('marche_initial', 0.0),
                'ts': project_data.get('ts', 0.0),
                # etc.
            })
        return {'status': 'ok'}
