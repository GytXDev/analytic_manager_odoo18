# ot_analytic_manager\models\analytic_dashboard.py
from odoo import models, fields, api, _
from odoo.http import content_disposition, request
from odoo.exceptions import ValidationError
from datetime import timedelta
import io
import xlsxwriter

class AnalyticDashboard(models.Model):
    _name = 'analytic.dashboard'
    _description = 'Tableau Analytique'

    name = fields.Many2one(
        'account.analytic.account',
        string="Code Projet",
        required=True,
        help="Sélectionnez le compte analytique associé au projet.",
        domain=[('code', '!=', False)]  
    )

    code_projet = fields.Char(
        string="Code Projet",
        related="name.name",
        store=False,   
        readonly=True
    )

    _sql_constraints = [
        ('unique_analytic_account', 'unique(name)', 'Un tableau analytique existe déjà pour ce projet !')
    ]

    libelle = fields.Char(
        string="Libellé",
    )

    date = fields.Date(
        'Date',
        required=True,
        index=True,
        default=fields.Date.context_today,
    )

    plan_id = fields.Many2one(
        comodel_name='account.analytic.plan',
        string="Plan Analytique",
    )

    marche_initial = fields.Float("Marché Initial")
    ts = fields.Float("Travaux Supplémentaires")
    factures_cumulees = fields.Float("Factures Cumulées", compute='_compute_factures_cumulees')
    non_facture = fields.Float("Non Facturé")
    depenses_cumulees = fields.Float(string="Dépenses Cumulées", compute='_compute_depenses_cumulees')
    debours_previsionnels = fields.Float("Débours Prévisionnels")
    debours_comptable_cumule = fields.Float("Débours comptable Cumulé", compute='_compute_debours_comptable_cumule')
    total_debourses = fields.Float("Total Déboursés", compute='_compute_total_debourses')
    trop_facture = fields.Float("Trop Facturé", compute='_compute_trop_facture')
  
    # Champs supplémentaires à renseigner 
    od_facture = fields.Float("Opérations Diverses Facturées")
    oda_d = fields.Float("Ordres Divers d'Achats Décaissés")
    ffnp = fields.Float("Factures Fournisseurs Non Parvenues")
    stocks = fields.Float("Stocks")
    provisions = fields.Float("Provisions")
    
    ca_final = fields.Float(
        string="CA Final (FCFA)", 
        compute='_compute_ca_final', 
        store=False
    )
    activite_cumulee = fields.Float(
        string="Activité Cumulée (FCFA)", 
        compute='_compute_activite_cumulee', 
        store=False
    )

    # Champ non stocké pour affichage dynamique
    pourcentage_avancement = fields.Float(
        string="Avancement (%)",
        compute='_compute_pourcentage_avancement',
        store=False  # Toujours à jour, mais pas utilisable en recherche SQL
    )

    # Champ stocké pour les recherches et tris SQL
    pourcentage_avancement_stored = fields.Float(
        string="Avancement (%) (Stocké)",
        compute='_compute_pourcentage_avancement',
        store=True
    )

    resultat_chantier_cumule = fields.Float(
        string="Résultat Chantier Cumulé", 
        compute='_compute_resultat_chantier_cumule', 
        store=False
    )

    # Ajout des champs d'écart temporel
    ecart_activite = fields.Float(
        string="Écart Activité (FCFA)", 
        compute='_compute_ecart_activite', 
        store=False
    )

    ecart_depenses = fields.Float( 
        string="Écart Dépenses (FCFA)", 
        compute='_compute_ecart_depenses', 
        store=False
    )

    def create_dashboard_for_all_analytic_accounts(self):
        """
        Cette méthode crée automatiquement un tableau de bord pour chaque compte analytique existant dans le système.
        """
        analytic_accounts = self.env['account.analytic.account'].search([])  # Recherche de tous les comptes analytiques
        created_count = 0
        for account in analytic_accounts:
            # Vérifie si un tableau analytique existe déjà pour ce compte analytique
            existing_dashboard = self.search([('name', '=', account.id)])
            if not existing_dashboard:
                # Crée un enregistrement dans 'analytic.dashboard' pour chaque compte analytique
                self.create({
                    'name': account.id,
                    'libelle': account.code,
                    'plan_id': account.plan_id.id,
                })
                created_count += 1

        if created_count > 0:
            return f"{created_count} Code projets créé(s)"
        else:
            return "Le tableau de bord est déjà à jour."

 
    # Récupère la réference et plan analytique asssocié au compte analytique / code projet
    @api.onchange('name')
    def _onchange_name(self):
        """
        Met à jour automatiquement les champs 'libelle' et 'plan_id' 
        en fonction du compte analytique sélectionné.
        """
        for record in self:
            if record.name:
                record.libelle = record.name.code
                record.plan_id = record.name.plan_id
            else:
                record.libelle = False
                record.plan_id = False


    @api.model
    def create(self, vals):
        if 'name' in vals:
            existing_dashboard = self.search([('name', '=', vals['name'])])
            if existing_dashboard:
                raise ValidationError(_('Une analyse analytique existe déjà pour ce projet !'))
        return super(AnalyticDashboard, self).create(vals)


    @api.depends('marche_initial', 'ts')
    def _compute_ca_final(self):
        for record in self:
            record.ca_final = round((record.marche_initial or 0) + (record.ts or 0), 2)

    # Calcule le total des factures fournisseurs
    @api.depends('name')
    def _compute_debours_comptable_cumule(self):
        for record in self:
            if record.name:
                factures_fournisseurs = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', 'in', ['in_invoice', 'in_refund']),
                    ('move_id.state', '=', 'posted')
                ])
                move_ids = factures_fournisseurs.mapped('move_id')

                total_factures_fournisseurs = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'in_invoice')
                total_avoirs_fournisseurs = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'in_refund')
                record.debours_comptable_cumule = total_factures_fournisseurs + total_avoirs_fournisseurs
            else:
                record.debours_comptable_cumule = 0.0
        
   
    # Calcule les dépenses cumulées
    @api.depends('debours_comptable_cumule', 'oda_d', 'ffnp', 'stocks', 'provisions')
    def _compute_depenses_cumulees(self):
        """
        Dépenses cumulées = Deb Compta Cumulées (fournisseurs) + ODA D. + Factures Fournisseurs Non Parvenues 
        + Stocks + Provisions
        """
        for record in self:
            record.depenses_cumulees = round(
                (record.debours_comptable_cumule or 0) + 
                (record.oda_d or 0) + 
                (record.ffnp or 0) + 
                (record.stocks or 0) + 
                (record.provisions or 0), 2
            )

    # Calcule le total des déboursés
    @api.depends('depenses_cumulees')
    def _compute_total_debourses(self):
        for record in self:
            record.total_debourses = record.depenses_cumulees

    # Calcule le total des factures clients
    @api.depends('name')
    def _compute_factures_cumulees(self):
        """
        Calcule le total hors taxes des factures clients,
        en soustrayant les montants des factures d'avoir (out_refund).
        """
        for record in self:
            if record.name:
                # Recherche des factures et avoirs liés au compte analytique
                move_lines = self.env['account.move.line'].search([
                    ('analytic_distribution', 'in', [record.name.id]),
                    ('move_id.move_type', 'in', ['out_invoice', 'out_refund']),
                    ('move_id.state', '=', 'posted')
                ])

                # Éliminer les doublons de factures
                move_ids = move_lines.mapped('move_id')

                # Calcul des factures et des avoirs
                total_factures = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'out_invoice')
                total_avoirs = sum(move.amount_untaxed_in_currency_signed for move in move_ids if move.move_type == 'out_refund')

                # Calcul final : Factures - Avoirs + ajustements
                record.factures_cumulees = (total_factures + total_avoirs) 
            else:
                record.factures_cumulees = 0.0

    # Calcule l'activité cumulée
    @api.depends('factures_cumulees', 'od_facture', 'non_facture', 'trop_facture')
    def _compute_activite_cumulee(self):
        for record in self:
            record.activite_cumulee = round(
                (record.factures_cumulees or 0) + 
                (record.od_facture or 0) + 
                (record.non_facture or 0) + 
                (record.trop_facture or 0), 2
            )

    @api.depends('debours_comptable_cumule', 'oda_d', 'ca_final', 'total_debourses', 'depenses_cumulees', 'factures_cumulees', 'od_facture')
    def _compute_trop_facture(self):
        for record in self:
            if record.debours_previsionnels == 0 or record.total_debourses == 0 or record.factures_cumulees == 0:
                record.trop_facture = 0.0
            else:
                total_debourses_previsionnels = record.total_debourses - record.debours_previsionnels
                if total_debourses_previsionnels != 0:
                    trop_facture_value = (record.ca_final * (record.total_debourses / total_debourses_previsionnels)) - record.factures_cumulees - record.od_facture
                    if trop_facture_value > 0:
                        record.trop_facture = 0.0
                    else:
                        record.trop_facture = trop_facture_value
                else:
                    record.trop_facture = 0.0


    @api.depends('activite_cumulee', 'depenses_cumulees')
    def _compute_resultat_chantier_cumule(self):
        for record in self:
            # Vérifie si l'une des valeurs est nulle
            if record.activite_cumulee is None or record.depenses_cumulees is None:
                record.resultat_chantier_cumule = 0.0  # Ou une autre valeur par défaut si nécessaire
            else:
                # Calcule le résultat chantier cumulé uniquement si les deux valeurs sont non nulles
                record.resultat_chantier_cumule = round(record.activite_cumulee + record.depenses_cumulees, 2)


    @api.depends('activite_cumulee', 'ca_final')
    def _compute_pourcentage_avancement(self):
        for record in self:
            if record.ca_final and record.activite_cumulee:
                valeur = (record.activite_cumulee or 0) / record.ca_final
                record.pourcentage_avancement = round(valeur, 2)
                record.pourcentage_avancement_stored = round(valeur, 2)
            else:
                record.pourcentage_avancement = 0.0
                record.pourcentage_avancement_stored = 0.0

    # Ajout des méthodes supplémentaires pour l'analyse des projets
    def get_all_projets(self, plan_id=None):
        domain = []
        if plan_id:
            domain.append(('plan_id', '=', plan_id))
        projets = self.search(domain)
        projets_data = []
        
        for projet in projets:
            projets_data.append({
                'id_code_project': projet.name.id,
                'code_projet': projet.name.name,
                'libelle': projet.libelle,
                'marche_initial': projet.marche_initial,
                'ts': projet.ts,
                'pourcentage_avancement': projet.pourcentage_avancement,
                'resultat_chantier_cumule': projet.resultat_chantier_cumule,
                'ca_final': projet.ca_final,
                'date': projet.date,
                'plan_id': projet.plan_id.id, 
                'trop_facture': projet.trop_facture,
                'factures_cumulees': projet.factures_cumulees,
                'depenses_cumulees': projet.depenses_cumulees,  
                'activite_cumulee': projet.activite_cumulee,  
                'non_facture': projet.non_facture,
                'od_facture': projet.od_facture,
                'oda_d': projet.oda_d,
                'ffnp': projet.ffnp,
                'stocks': projet.stocks,
                'provisions': projet.provisions,
                'total_debourses': projet.total_debourses,
                'debours_previsionnels': projet.debours_previsionnels,
                'debours_comptable_cumule': projet.debours_comptable_cumule,
            })
        
        return projets_data


    def get_totals_for_plan(self, plan_id):
        """
        Retourne les valeurs totales de resultat_chantier, activite_cumulee, depenses_cumulees et factures_cumulees pour un plan spécifique.
        """
        projets = self.search([('plan_id', '=', plan_id)])
        resultat_chantier_cumule = sum(projet.resultat_chantier_cumule for projet in projets)
        activite_cumulee = sum(projet.activite_cumulee for projet in projets)
        depenses_cumulees = sum(projet.depenses_cumulees for projet in projets)
        factures_cumulees = sum(projet.factures_cumulees for projet in projets)

        return {
            'resultat_chantier_cumule': resultat_chantier_cumule,
            'activite_cumulee': activite_cumulee,
            'depenses_cumulees': depenses_cumulees,
            'factures_cumulees': factures_cumulees,
        }

    @api.model
    def get_all_plans(self):
        """
        Retourne uniquement les plans analytiques qui ont au moins un code projet associé.
        """
        plans = self.env['account.analytic.plan'].search([
            '|',
            ('parent_id', '!=', False),
            ('children_ids', '=', False),
        ])

        plans_data = []
        for plan in plans:
            # Vérifier si au moins un projet est associé à ce plan
            projets_count = self.search_count([('plan_id', '=', plan.id)])
            if projets_count > 0:  # ✅ Filtrer les plans sans projets
                totals = self.get_totals_for_plan(plan.id)
                plans_data.append({
                    'id': plan.id,
                    'name': plan.name,
                    'resultat_chantier_cumule': totals['resultat_chantier_cumule'],
                    'activite_cumulee': totals['activite_cumulee'],
                    'depenses_cumulees': totals['depenses_cumulees'],
                    'factures_cumulees': totals['factures_cumulees'],
                })

        return {
            'count': len(plans_data),  # 🟢 Ne compte que les plans ayant des projets
            'plans': plans_data,
        }


    @api.model
    def get_resultat_chantier_total(self, start_date=None, end_date=None):
        # Logique pour calculer le résultat chantier total selon les dates
        domain = []
        if start_date:
            domain.append(('date', '>=', start_date))
        if end_date:
            domain.append(('date', '<=', end_date))

        total = sum(self.search(domain).mapped('resultat_chantier_cumule'))
        return {'resultat_chantier_total': total}
    

    @api.model
    def get_progression_moyenne(self, start_date=None, end_date=None):
        # Logique pour calculer la progression moyenne selon les dates
        domain = []
        if start_date:
            domain.append(('date', '>=', start_date))
        if end_date:
            domain.append(('date', '<=', end_date))

        progression = self.search(domain).mapped('pourcentage_avancement')
        if progression:
            return {'progression_moyenne': sum(progression) / len(progression)}
        return {'progression_moyenne': 0}
    
    def get_statistiques_projets(self):
        """
        Retourne des statistiques générales sur les projets sans distinction entre projets en cours et terminés.
        """
        projets = self.get_all_projets()  
        total_projets = len(projets) 
        return {
            'total_projets': total_projets,
            'resultat_chantier_total': self.get_resultat_chantier_total().get('resultat_chantier_total', 0),
            'progression_moyenne': self.get_progression_moyenne().get('progression_moyenne', 0),
        }
    # Méthode pour mettre à jour un projet spécifique
    def update_project(self, project_id, values):
        """
        Met à jour les champs d'un projet spécifique.
        """
        project = self.search([('name.id', '=', project_id)], limit=1)
        if project:
            project.write(values)
            return {'status': 'success', 'message': 'Projet mis à jour avec succès'}
        else:
            return {'status': 'error', 'message': 'Projet non trouvé'}

    def update_all_projects(self, values):
        """
        Met à jour les champs de tous les projets.
        """
        projects = self.search([])
        if projects:
            projects.write(values)
            return {'status': 'success', 'message': 'Tous les projets ont été mis à jour avec succès'}
        else:
            return {'status': 'error', 'message': 'Aucun projet trouvé'}
    
    
    def get_donnees_projets_independantes(self, plan_id=None):
        projets = self.get_all_projets(plan_id) 
        projets_donnees = [] 

        for projet in projets:
            projet_donnees = {
                'id_code_project': projet['id_code_project'],
                'code_projet': projet['code_projet'],
                'libelle': projet['libelle'] or 'Non renseigné',  # Afficher "Non renseigné" si le libellé est False
                'marche_initial': projet['marche_initial'] or 0,
                'ts': projet['ts'] or 0,
                'pourcentage_avancement': projet['pourcentage_avancement'] or 0,
                'resultat_chantier_cumule': projet['resultat_chantier_cumule'] or 0,
                'ca_final': projet['ca_final'] or 0,
                'date': projet['date'],
                'plan_id': projet['plan_id'],
                'trop_facture': projet['trop_facture'],
                'factures_cumulees': projet['factures_cumulees'] or 0, 
                'depenses_cumulees': projet['depenses_cumulees'] or 0,
                'activite_cumulee': projet['activite_cumulee'] or 0,
                'od_facture': projet['od_facture'],
                'non_facture': projet['non_facture'] or 0,
                'oda_d': projet['oda_d'] or 0,
                'ffnp': projet['ffnp'] or 0,
                'stocks': projet['stocks'] or 0,
                'provisions': projet['provisions'] or 0,
                'total_debourses': projet['total_debourses'] or 0,
                'debours_previsionnels': projet['debours_previsionnels'] or 0,
                'debours_comptable_cumule': projet['debours_comptable_cumule'] or 0,
            }
            projets_donnees.append(projet_donnees)  
        
        return projets_donnees
    
    def export_to_excel(self):
        """
        Génère un fichier Excel avec les données des projets, regroupés par plan,
        puis ajoute un petit bloc supplémentaire (Activité Cumulée, PLAN, %)
        décalé vers la droite, pour chaque plan.
        """

        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        worksheet = workbook.add_worksheet()

        # -- Formats généraux --
        header_format = workbook.add_format({
            'bold': True,
            'bg_color': '#138d75',
            'font_color': 'white',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        cell_format = workbook.add_format({
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        highlight_format = workbook.add_format({
            'bg_color': 'yellow',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        lowlight_format = workbook.add_format({
            'bg_color': '#5dade2',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })
        total_format = workbook.add_format({
            'bold': True,
            'bg_color': '#f9f9f9',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })

        # Format rouge pour la ligne "PLAN"
        red_format = workbook.add_format({
            'font_color': 'red',
            'border': 1,
            'align': 'center',
            'valign': 'vcenter'
        })

        # -- En-têtes --
        headers = [
            'Code Projet', 'Libellé', 'Marché Initial', 'TS', 'CA Final', 'Fact Comptable Cumulées',
            'OD Facture', 'Non Facturé', 'Trop Facturé', 'Activité Cumulée', '%avt',
            'Débours Comptable Cumulé', 'ODA D', 'FFNP', 'Stocks', 'Provisions',
            'Total Déboursés', 'Dépenses Cumulées', 'Débours Prévisionnels', 'Resultat Chantier'
        ]

        # Récupération de tous les plans
        plans = self.env['account.analytic.plan'].search([])
        row_num = 0

        for plan in plans:
            # Titre d'en-tête du plan
            worksheet.merge_range(row_num, 0, row_num, len(headers) - 1, f"Exploitation: {plan.name}", total_format)
            row_num += 2

            # Écrire les en-têtes de colonnes
            for col_num, header in enumerate(headers):
                worksheet.write(row_num, col_num, header, header_format)
            row_num += 1

            # Récupérer les projets liés à ce plan
            projets = self.search([('plan_id', '=', plan.id)])

            # Écriture des lignes du tableau principal
            for projet in projets:
                worksheet.write(row_num, 0,  projet.name.name if projet.name else "", cell_format)
                worksheet.write(row_num, 1,  projet.libelle or "", cell_format)
                worksheet.write(row_num, 2,  projet.marche_initial, cell_format)
                worksheet.write(row_num, 3,  projet.ts, cell_format)
                worksheet.write(row_num, 4,  projet.ca_final, cell_format)
                worksheet.write(row_num, 5,  projet.factures_cumulees, highlight_format)
                worksheet.write(row_num, 6,  projet.od_facture, cell_format)
                worksheet.write(row_num, 7,  projet.non_facture, cell_format)
                worksheet.write(row_num, 8,  projet.trop_facture, cell_format)
                worksheet.write(row_num, 9,  projet.activite_cumulee, cell_format)
                worksheet.write(row_num, 10, projet.pourcentage_avancement * 100, lowlight_format)
                worksheet.write(row_num, 11, projet.debours_comptable_cumule, highlight_format)
                worksheet.write(row_num, 12, projet.oda_d, cell_format)
                worksheet.write(row_num, 13, projet.ffnp, cell_format)
                worksheet.write(row_num, 14, projet.stocks, cell_format)
                worksheet.write(row_num, 15, projet.provisions, cell_format)
                worksheet.write(row_num, 16, projet.total_debourses, cell_format)
                worksheet.write(row_num, 17, projet.depenses_cumulees, cell_format)
                worksheet.write(row_num, 18, projet.debours_previsionnels, cell_format)
                worksheet.write(row_num, 19, projet.resultat_chantier_cumule, cell_format)

                row_num += 1

            # Calcul des totaux (comme dans votre code)
            total_marche_initial = sum(projet.marche_initial for projet in projets)
            total_ts = sum(projet.ts for projet in projets)
            total_ca_final = sum(projet.ca_final for projet in projets)
            total_factures_cumulees = sum(projet.factures_cumulees for projet in projets)
            total_od_facture = sum(projet.od_facture for projet in projets)
            total_non_facture = sum(projet.non_facture for projet in projets)
            total_trop_facture = sum(projet.trop_facture for projet in projets)
            total_activite_cumulee = sum(projet.activite_cumulee for projet in projets)
            total_debours_comptable_cumule = sum(projet.debours_comptable_cumule for projet in projets)
            total_oda_d = sum(projet.oda_d for projet in projets)
            total_ffnp = sum(projet.ffnp for projet in projets)
            total_stocks = sum(projet.stocks for projet in projets)
            total_provisions = sum(projet.provisions for projet in projets)
            total_total_debourses = sum(projet.total_debourses for projet in projets)
            total_depenses_cumulees = sum(projet.depenses_cumulees for projet in projets)
            total_debours_previsionnels = sum(projet.debours_previsionnels for projet in projets)
            total_resultat_chantier_cumule = sum(projet.resultat_chantier_cumule for projet in projets)

            if projets:
                avg_pourcentage = sum(projet.pourcentage_avancement * 100 for projet in projets) / len(projets)
            else:
                avg_pourcentage = 0

            # Ligne de totaux
            worksheet.merge_range(row_num, 0, row_num, 1, f"RESULTAT OGOOUE {plan.name}", total_format)
            worksheet.write(row_num, 2,  total_marche_initial, total_format)
            worksheet.write(row_num, 3,  total_ts, total_format)
            worksheet.write(row_num, 4,  total_ca_final, total_format)
            worksheet.write(row_num, 5,  total_factures_cumulees, total_format)
            worksheet.write(row_num, 6,  total_od_facture, total_format)
            worksheet.write(row_num, 7,  total_non_facture, total_format)
            worksheet.write(row_num, 8,  total_trop_facture, total_format)
            worksheet.write(row_num, 9,  total_activite_cumulee, total_format)
            worksheet.write(row_num, 10, avg_pourcentage, total_format)
            worksheet.write(row_num, 11, total_debours_comptable_cumule, total_format)
            worksheet.write(row_num, 12, total_oda_d, total_format)
            worksheet.write(row_num, 13, total_ffnp, total_format)
            worksheet.write(row_num, 14, total_stocks, total_format)
            worksheet.write(row_num, 15, total_provisions, total_format)
            worksheet.write(row_num, 16, total_total_debourses, total_format)
            worksheet.write(row_num, 17, total_depenses_cumulees, total_format)
            worksheet.write(row_num, 18, total_debours_previsionnels, total_format)
            worksheet.write(row_num, 19, total_resultat_chantier_cumule, total_format)

            # ----- BLOC SUPPLÉMENTAIRE COMME LE summary-table -----
            # Chercher l'objectif de plan dans dashboard.plan
            plan_objective = 0
            plan_obj = self.env['dashboard.plan'].sudo().search([('name', '=', str(plan.id))], limit=1)
            if plan_obj:
                plan_objective = plan_obj.plan

            # Pourcentage d'activité vs plan
            if plan_objective:
                pourcentage_activite_plan = (total_activite_cumulee / plan_objective) * 100
            else:
                pourcentage_activite_plan = 0

            # Petit espace vertical
            row_num += 2

            # Définir la colonne de départ (ex. 4 => on commence en colonne E)
            col_offset = 4

            # 1ère LIGNE : Activité Cumulée | total_activite_cumulee | (vide)
            worksheet.write(row_num, col_offset,     "Activité Cumulée", cell_format)
            worksheet.write(row_num, col_offset + 1, total_activite_cumulee, cell_format)
            worksheet.write(row_num, col_offset + 2, "", cell_format)
            row_num += 1

            # 2ᵉ LIGNE : PLAN | plan_objective | %ActivitéPlan
            worksheet.write(row_num, col_offset,     "PLAN", red_format)
            worksheet.write(row_num, col_offset + 1, plan_objective, red_format)
            worksheet.write(row_num, col_offset + 2, f"{round(pourcentage_activite_plan,2)}%", red_format)

            # On incrémente row_num pour laisser un espace avant le prochain plan
            row_num += 3

        # Finaliser l'export
        workbook.close()
        output.seek(0)
        return output.getvalue()